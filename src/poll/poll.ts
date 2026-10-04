import type { PublicPoll } from "../public/types";

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_LABEL = 40;
export const DEFAULT_DURATION_MS = 20_000;

export interface PollState {
  id: string;
  options: { id: string; label: string }[];
  durationMs: number;
  deadline: number;
  status: "open" | "closed" | "cancelled";
  /** Host-private. Keyed by connection identity from the framework, never from the payload. */
  ballots: Record<string, { optionId: string; requestId?: string }>;
}

export type VoteResult =
  | { ok: true; status: "accepted" | "duplicate"; optionId: string }
  | { ok: false; reason: "no_poll" | "stale_poll" | "closed" | "invalid" | "unknown_option" | "already_voted" };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function openPoll(
  candidates: string[],
  now: number,
  newId: () => string,
  durationMs = DEFAULT_DURATION_MS,
): { ok: true; poll: PollState } | { ok: false; error: string } {
  const labels = candidates.map((c) => c.trim()).filter(Boolean);
  if (labels.length < MIN_OPTIONS || labels.length > MAX_OPTIONS) {
    return { ok: false, error: `Enter ${MIN_OPTIONS} to ${MAX_OPTIONS} suggested guesses.` };
  }
  if (new Set(labels.map(norm)).size !== labels.length) return { ok: false, error: "Suggestions must be different." };
  if (labels.some((l) => l.length > MAX_LABEL)) return { ok: false, error: `Keep each suggestion under ${MAX_LABEL} characters.` };
  const id = newId();
  return {
    ok: true,
    poll: {
      id,
      options: labels.map((label, k) => ({ id: `${id}-o${k + 1}`, label })),
      durationMs,
      deadline: now + durationMs,
      status: "open",
      ballots: {},
    },
  };
}

/** Close an open poll once its host deadline has passed. */
export const tick = (p: PollState, now: number): PollState => (p.status === "open" && now >= p.deadline ? { ...p, status: "closed" } : p);
export const closePoll = (p: PollState): PollState => (p.status === "open" ? { ...p, status: "closed" } : p);
export const cancelPoll = (p: PollState): PollState => (p.status === "open" ? { ...p, status: "cancelled" } : p);

const ID = /^[\w-]{1,64}$/;

/** One final choice per participant per poll. Retrying the same choice confirms without recounting. */
export function castVote(p: PollState | null, actorId: string, payload: unknown, now: number): { poll: PollState | null; result: VoteResult } {
  const fail = (reason: Extract<VoteResult, { ok: false }>["reason"]) => ({ poll: p, result: { ok: false, reason } as VoteResult });
  if (!p) return fail("no_poll");
  if (typeof payload !== "object" || payload === null) return fail("invalid");
  const { pollId, optionId, requestId } = payload as Record<string, unknown>;
  if (typeof pollId !== "string" || !ID.test(pollId) || typeof optionId !== "string" || !ID.test(optionId)) return fail("invalid");
  if (requestId !== undefined && (typeof requestId !== "string" || !ID.test(requestId))) return fail("invalid");
  if (!actorId) return fail("invalid");
  if (pollId !== p.id) return fail("stale_poll");
  const live = tick(p, now);
  if (live.status !== "open") return { poll: live, result: { ok: false, reason: "closed" } };
  if (!live.options.some((o) => o.id === optionId)) return { poll: live, result: { ok: false, reason: "unknown_option" } };
  const prior = live.ballots[actorId];
  if (prior) {
    return prior.optionId === optionId
      ? { poll: live, result: { ok: true, status: "duplicate", optionId } }
      : { poll: live, result: { ok: false, reason: "already_voted" } };
  }
  return {
    poll: { ...live, ballots: { ...live.ballots, [actorId]: { optionId, ...(requestId ? { requestId } : {}) } } },
    result: { ok: true, status: "accepted", optionId },
  };
}

/** What a returning phone gets after a refresh: only its own status. */
export const voteStatus = (p: PollState | null, actorId: string, pollId: string): { voted: false } | { voted: true; optionId: string } => {
  const b = p && p.id === pollId ? p.ballots[actorId] : undefined;
  return b ? { voted: true, optionId: b.optionId } : { voted: false };
};

export function publicPoll(p: PollState, now: number): PublicPoll {
  const live = tick(p, now);
  const ballots = Object.values(live.ballots);
  return {
    id: live.id,
    status: live.status === "open" ? "open" : "closed",
    options: live.options,
    durationMs: live.durationMs,
    remainingMs: live.status === "open" ? Math.max(0, live.deadline - now) : 0,
    responses: ballots.length,
    // Totals only after close. Individual ballots never leave the host.
    results: live.status === "open" ? null : live.options.map((o) => ({ optionId: o.id, votes: ballots.filter((b) => b.optionId === o.id).length })),
  };
}
