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
  const pollCount = useRef(0);

  const fetchTrip = useCallback(async (s: TripSession) => {
    setLoad({ status: "loading" });
    try {
      setTrip(await api.getTrip(s.tripId, s.token));
      setLoad({ status: "ready" });
    } catch (err) {
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
      try {
        setTrip(await api.getTrip(session.tripId, session.token));
      } catch {
        // A failed poll leaves the last known trip visible; the refresh button remains available.
      }
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [trip, session]);

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
      setPending({ ...message, status: "sending", error: undefined });
      try {
        const res = await api.sendMessage(session.tripId, session.token, {
          client_message_id: message.id,
          ...message.payload,
        });
        setTrip(res.trip);
        setLastReply(res.reply);
        setPending(null);
        pollCount.current = 0;
        return true;
      } catch (err) {
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
