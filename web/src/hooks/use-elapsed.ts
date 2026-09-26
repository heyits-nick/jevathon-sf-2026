"use client";

import { useEffect, useState } from "react";

/** Seconds elapsed since mount, updated every 100ms. */
export function useElapsed() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  return elapsed;
}
