"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { clearTripSession, loadTripSession, saveTripSession, type TripSession } from "@/lib/api/trip-session";
import type { CreateTripRequest, Trip, TripMessageRequest } from "@/lib/api/types";

const POLL_INTERVAL_MS = 4_000;
const MAX_POLLS = 20;

export type MessagePayload = Omit<TripMessageRequest, "client_message_id">;

interface PendingMessage {
  id: string;
  payload: MessagePayload;
  status: "sending" | "failed";
  error?: string;
}

type LoadState = { status: "restoring" } | { status: "none" } | { status: "loading" } | { status: "ready" } | { status: "error"; error: string };

export function useTrip() {
  const [session, setSession] = useState<TripSession | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "restoring" });
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const [creating, setCreating] = useState<{ error?: string } | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const pollCount = useRef(0);
  // Bumped on every getTrip start and on startOver; an older getTrip response is ignored.
  const requestGeneration = useRef(0);
  // Bumped on startOver; a message sent under an earlier session cannot update the new one.
  const sessionGeneration = useRef(0);

  const fetchTrip = useCallback(async (s: TripSession) => {
    const generation = ++requestGeneration.current;
    setLoad({ status: "loading" });
    try {
      const next = await api.getTrip(s.tripId, s.token);
      if (generation !== requestGeneration.current) return;
      setTrip(next);
      setLoad({ status: "ready" });
    } catch (err) {
      if (generation !== requestGeneration.current) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) {
        clearTripSession();
        setSession(null);
        setTrip(null);
        setLoad({ status: "none" });
        return;
      }
      setLoad({ status: "error", error: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    const restored = loadTripSession();
    // Restoring from sessionStorage is only possible after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(restored);
    if (restored) fetchTrip(restored);
    else setLoad({ status: "none" });
  }, [fetchTrip]);

  const refresh = useCallback(() => {
    if (session) return fetchTrip(session);
  }, [session, fetchTrip]);

  useEffect(() => {
    if (trip?.status !== "researching" || !session) {
      pollCount.current = 0;
      return;
    }
    if (pollCount.current >= MAX_POLLS) return;
    const id = setTimeout(async () => {
      pollCount.current += 1;
      const generation = ++requestGeneration.current;
      try {
        const next = await api.getTrip(session.tripId, session.token);
        if (generation === requestGeneration.current) setTrip(next);
        // A superseding request owns the response; still schedule the next poll in case it fails.
        else setPollTick((n) => n + 1);
      } catch {
        // Keep the last known trip visible and schedule the next poll; failures still count toward MAX_POLLS.
        setPollTick((n) => n + 1);
      }
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [trip, session, pollTick]);

  const createTrip = useCallback(
    async (req: CreateTripRequest) => {
      setCreating({});
      try {
        const { trip_id, access_token } = await api.createTrip(req);
        const s = { tripId: trip_id, token: access_token };
        saveTripSession(s);
        setSession(s);
        setCreating(null);
        await fetchTrip(s);
      } catch (err) {
        setCreating({ error: errorMessage(err) });
      }
    },
    [fetchTrip],
  );

  const deliver = useCallback(
    async (message: PendingMessage) => {
      if (!session) return false;
      const generation = sessionGeneration.current;
      setPending({ ...message, status: "sending", error: undefined });
      try {
        const res = await api.sendMessage(session.tripId, session.token, {
          client_message_id: message.id,
          ...message.payload,
        });
        if (generation !== sessionGeneration.current) return false;
        // The delivered trip is newest; an in-flight refresh or poll must not overwrite it.
        requestGeneration.current += 1;
        setTrip(res.trip);
        setLoad({ status: "ready" });
        setLastReply(res.reply);
        setPending(null);
        pollCount.current = 0;
        return true;
      } catch (err) {
        if (generation !== sessionGeneration.current) return false;
        setPending({ ...message, status: "failed", error: errorMessage(err) });
        return false;
      }
    },
    [session],
  );

  const sendMessage = useCallback(
    (payload: MessagePayload) => deliver({ id: crypto.randomUUID(), payload, status: "sending" }),
    [deliver],
  );

  /** Retries reuse the original client_message_id so the server can deduplicate. */
  const retryMessage = useCallback(() => (pending ? deliver(pending) : Promise.resolve(false)), [pending, deliver]);

  const startOver = useCallback(() => {
    requestGeneration.current += 1;
    sessionGeneration.current += 1;
    clearTripSession();
    setSession(null);
    setTrip(null);
    setPending(null);
    setLastReply(null);
    setLoad({ status: "none" });
  }, []);

  return { trip, load, lastReply, pending, creating, createTrip, refresh, sendMessage, retryMessage, startOver };
}

export type UseTrip = ReturnType<typeof useTrip>;
