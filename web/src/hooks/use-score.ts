"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { ScoreRequest, ScoreResponse } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/errors";

export type ScoreState =
  | { status: "idle" }
  | { status: "loading"; request: ScoreRequest }
  | { status: "success"; runId: number; request: ScoreRequest; result: ScoreResponse; roundTripMs: number }
  | { status: "error"; request: ScoreRequest; error: string };

export function useScore(initial: ScoreState = { status: "idle" }) {
  const [state, setState] = useState<ScoreState>(initial);
  const latestRequest = useRef(0);

  const submit = useCallback(async (request: ScoreRequest) => {
    const id = ++latestRequest.current;
    const startedAt = performance.now();
    setState({ status: "loading", request });

    try {
      const result = await api.score(request);
      if (id !== latestRequest.current) return;
      setState({ status: "success", runId: id, request, result, roundTripMs: performance.now() - startedAt });
    } catch (err) {
      if (id !== latestRequest.current) return;
      setState({ status: "error", request, error: errorMessage(err) });
    }
  }, []);

  return { state, submit };
}
