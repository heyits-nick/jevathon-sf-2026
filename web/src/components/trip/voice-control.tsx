"use client";

import { useEffect, useRef, useState } from "react";

type VoiceOptions = {
  tripId: string;
  accessToken: string;
  voiceBase: string;
  onTrip: (trip: unknown) => void;
  showTextFallback: false;
};

declare global {
  interface Window {
    JevVoice?: { mountVoice: (container: HTMLElement, options: VoiceOptions) => () => void };
  }
}

const moduleLoads = new Map<string, Promise<void>>();

function loadModule(src: string): Promise<void> {
  if (window.JevVoice) return Promise.resolve();
  const pending = moduleLoads.get(src);
  if (pending) return pending;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.onload = () => {
      if (window.JevVoice) resolve();
      else { script.remove(); reject(new Error("Voice module did not load")); }
    };
    script.onerror = () => { script.remove(); reject(new Error("Voice module unavailable")); };
    document.head.append(script);
  });
  moduleLoads.set(src, loading);
  void loading.catch(() => moduleLoads.delete(src));
  return loading;
}

export function VoiceControl({ tripId, accessToken, voiceBase, onTrip }: Omit<VoiceOptions, "showTextFallback">) {
  const host = useRef<HTMLDivElement>(null);
  const onTripRef = useRef(onTrip);
  const [error, setError] = useState(false);

  useEffect(() => { onTripRef.current = onTrip; }, [onTrip]);
  useEffect(() => {
    if (!tripId || !accessToken) return;
    let active = true;
    let dispose: (() => void) | undefined;
    const src = `${voiceBase.replace(/\/$/, "")}/voice-client.mjs`;
    void loadModule(src).then(() => {
      if (!active || !host.current) return;
      setError(false);
      dispose = window.JevVoice?.mountVoice(host.current, {
        tripId, accessToken, voiceBase,
        onTrip: trip => onTripRef.current(trip),
        showTextFallback: false,
      });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; dispose?.(); };
  }, [tripId, accessToken, voiceBase]);

  return <><div ref={host} />{error && <p role="status">Voice is unavailable. Use the trip message field.</p>}</>;
}
