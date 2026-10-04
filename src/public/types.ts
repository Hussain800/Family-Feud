// The only shapes that ever leave the moderator window (BroadcastChannel to the projector,
// Air Jam replicated store to phones). Built by an allowlist in project.ts, never by copying host state.
import type { Phase, TeamId } from "../engine/types";

export type PublicSlot =
  | { index: number; revealed: false }
  | { index: number; revealed: true; text: string; count: number };

export interface PublicPoll {
  id: string;
  status: "open" | "closed";
  options: { id: string; label: string }[];
  durationMs: number;
  /** Milliseconds left when this snapshot was published. Phones count down from receipt; the host deadline is the authority. */
  remainingMs: number;
  /** Number of accepted ballots. Per-option totals appear only once closed. */
  responses: number;
  results: { optionId: string; votes: number }[] | null;
}

export type RelayStatus = "ready" | "connecting" | "offline";

export interface PublicSnapshot {
  rev: number;
  demoLabel: string | null;
  room: {
    code: string | null;
    joinUrl: string | null;
    status: RelayStatus;
    connected: number;
    capacity: number;
  };
  phase: Phase | "preview";
  teams: { id: TeamId; name: string; score: number }[];
  control: TeamId | null;
  pot: number;
  strikes: number;
  round: {
    number: number;
    total: number;
    category: string;
    prompt: string;
    columns: 1 | 2;
    slots: PublicSlot[];
  } | null;
  note: string | null;
  settlement: { winner: TeamId; amount: number; kind: string } | null;
  poll: PublicPoll | null;
}

export const EMPTY_SNAPSHOT: PublicSnapshot = {
  rev: 0,
  demoLabel: null,
  room: { code: null, joinUrl: null, status: "connecting", connected: 0, capacity: 0 },
  phase: "lobby",
  teams: [
    { id: "A", name: "Team A", score: 0 },
    { id: "B", name: "Team B", score: 0 },
  ],
  control: null,
  pot: 0,
  strikes: 0,
  round: null,
  note: null,
  settlement: null,
  poll: null,
};
