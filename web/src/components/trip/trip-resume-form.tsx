"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { saveTripSession } from "@/lib/api/trip-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TripResumeForm() {
  const [tripId, setTripId] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const importFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setTripId("");
    setToken("");
    try {
      if (file.size > 4096) throw new Error();
      const value: unknown = JSON.parse(await file.text());
      if (!value || typeof value !== "object" ||
          !("trip_id" in value) || typeof value.trip_id !== "string" || !value.trip_id.trim() ||
          !("access_token" in value) || typeof value.access_token !== "string" || !value.access_token.trim()) throw new Error();
      setTripId(value.trip_id);
      setToken(value.access_token);
    } catch { setError("Choose a valid presenter pairing JSON file."); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = tripId.trim();
    const accessToken = token.trim();
    setPending(true);
    setError("");
    try {
      await api.getTrip(id, accessToken);
      saveTripSession({ tripId: id, token: accessToken });
      window.location.reload();
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted-foreground">Choose the presenter pairing file, or enter the trip ID and access token from it.</p>
      <Input aria-label="Presenter pairing JSON file" type="file" accept="application/json,.json" onChange={(event) => { void importFile(event.target.files?.[0]); }} />
      <Input aria-label="Existing trip ID" autoComplete="off" required value={tripId} onChange={(event) => setTripId(event.target.value)} placeholder="Trip ID" />
      <Input aria-label="Existing trip access token" type="password" autoComplete="off" required value={token} onChange={(event) => setToken(event.target.value)} placeholder="Access token" />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Opening…" : "Open trip"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
