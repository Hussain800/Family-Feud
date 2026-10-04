// The only shapes that ever leave the moderator window (BroadcastChannel to the projector,
// Air Jam replicated store to buzzer phones). Built by an allowlist in project.ts, never by copying host state.
import type { Phase, TeamId } from "../engine/types";

export type PublicSlot =
  | { index: number; revealed: false }
  | { index: number; revealed: true; text: string; count: number };

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
  /** Rounds completed so far and the planned total. Drives the between-rounds scoreboard. */
  progress: { played: number; total: number; /** The round in play, or coming next, is a tie-break. */ tieBreak: boolean };
  /** A countdown the host started. `endsAt` is the host's clock; the projector is a second window of the same browser, so the clocks agree. */
  timer: { endsAt: number; durationMs: number } | null;
  note: string | null;
  settlement: { winner: TeamId; amount: number; kind: string } | null;
  /** The buzzer duel. Only who buzzed and whether each answer hit; the hit itself is already a revealed slot. */
  faceOff: PublicFaceOff | null;
  /** Phone-buzzer mode only; null with physical buzzers. */
  buzzers: PublicBuzzers | null;
  /** This snapshot comes from an Undo: the projector replays no sound or effect for it. */
  undone: boolean;
}

/** Times are when each press reached the moderator laptop, counted from when the buzzers opened. Not press times. */
export interface PublicBuzzers {
  open: boolean;
  /** Changes every time the buzzers open, so a press meant for an earlier opening is refused. */
  armId: string | null;
  paired: Record<TeamId, boolean>;
  /** Pairing generation per team. A phone whose pairing generation no longer matches has been unpaired. */
  gen: Record<TeamId, number>;
  /** The paired phone is connected to the relay right now. */
  online: Record<TeamId, boolean>;
  first: { team: TeamId; ms: number } | null;
  second: { team: TeamId; ms: number } | null;
}

export interface PublicFaceOff {
  buzzed: TeamId | null;
  tries: Record<TeamId, "hit" | "miss" | null>;
  /** The answers so far settle it by the survey: the room waits for the hosts' call. */
  awaitingHosts: boolean;
  winner: TeamId | null;
  choice: "play" | "pass" | null;
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
  progress: { played: 0, total: 3, tieBreak: false },
  timer: null,
  note: null,
  settlement: null,
  faceOff: null,
  buzzers: null,
  undone: false,
};
