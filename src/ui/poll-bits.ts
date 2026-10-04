import { useEffect, useMemo, useState } from "react";
import type { PublicPoll } from "../public/types";

/** Informative countdown, counted from when the snapshot arrived. The host deadline decides acceptance. */
export function useRemaining(poll: PublicPoll | null): number {
  const key = poll ? `${poll.id}:${poll.status}:${poll.remainingMs}` : "";
  const start = useMemo(() => ({ at: Date.now(), key }), [key]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!poll || poll.status !== "open") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [poll?.id, poll?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!poll || poll.status !== "open") return 0;
  return Math.max(0, poll.remainingMs - (now - start.at));
}

/** Top option(s) after close. Ties and empty polls are settled aloud, so we only report them. */
export function tally(poll: PublicPoll): { total: number; top: string[]; topVotes: number } {
  const results = poll.results ?? [];
  const topVotes = Math.max(0, ...results.map((r) => r.votes));
  return {
    total: results.reduce((n, r) => n + r.votes, 0),
    top: topVotes > 0 ? results.filter((r) => r.votes === topVotes).map((r) => r.optionId) : [],
    topVotes,
  };
}
