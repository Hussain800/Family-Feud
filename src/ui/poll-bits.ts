import { useEffect, useState } from "react";

/** The current time, refreshed while `active`. */
export function useNow(active: boolean, everyMs = 100): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}
