import type { Answer } from "../content/types";
import type { TeamColor } from "../teams";

export type TeamId = "A" | "B";
export type Phase = "lobby" | "intro" | "board_ready" | "face_off" | "play_or_pass" | "team_turn" | "steal" | "round_over" | "match_over";

export const MAX_STRIKES = 3;
export const SEEN_LIMIT = 64;
export const HISTORY_LIMIT = 40;

export interface Settlement {
  winner: TeamId;
  /** Points actually added to the winner. Undo restores the snapshot, never recomputes. */
  amount: number;
  kind: "clear" | "steal_success" | "steal_fail" | "ended_early";
}

/** The opening buzzer duel between one player from each team. Strikes do not apply here. */
export interface FaceOff {
  /** Team whose buzzer landed first this attempt. */
  buzzed: TeamId | null;
  /** How the host judged each player's answer. A hit is already revealed on the board; count is its survey count. */
  tries: Partial<Record<TeamId, { hit: boolean; count: number }>>;
  winner: TeamId | null;
  /** The winner's choice, set once. */
  choice: "play" | "pass" | null;
}

export interface RoundState {
  roundId: string;
  questionId: string;
  category: string;
  prompt: string;
  /** Frozen copy taken at round start so pack edits cannot change a round in progress. */
  answers: Answer[];
  controllingTeam: TeamId;
  /** Answer ids, in reveal order. Includes post-settlement discussion reveals. */
  revealed: string[];
  strikes: number;
  pot: number;
  stealResult: "success" | "fail" | null;
  /** The round came from the labelled demo pack. Kept with the round so a resume cannot unlabel it. */
  demo: boolean;
  /** True when the controlling team uncovered every answer. */
  cleared: boolean;
  settlement: Settlement | null;
  /** Null until a face-off starts, and for rounds where the host skipped it (or saved before it existed). */
  faceOff: FaceOff | null;
}

export interface GameState {
  phase: Phase;
  /** `color` is the team's chosen identity ("Team Red"). Unset on saves made before colours, and until one is picked. */
  teams: Record<TeamId, { name: string; score: number; color?: TeamColor }>;
  roundsPlayed: number;
  totalRounds: number;
  playedQuestionIds: string[];
  /** Rounds played when the first tie-break was added: every round from there on is a tie-break. Unset on saves made before it existed. */
  tieBreakFrom?: number | null;
  /** Questions played by earlier pairs of teams at this event. They can be replayed, but the console marks them. */
  usedEarlier?: string[];
  round: RoundState | null;
  /** Short host-facing message such as ALREADY ON THE BOARD. Not part of scoring. */
  note: string | null;
  /** Recent action ids. A repeated delivery of one input is a no-op. */
  seen: string[];
}

export interface ReadyQuestionSnapshot {
  id: string;
  category: string;
  prompt: string;
  demo: boolean;
  answers: Answer[];
}

export type Action =
  | { id: string; type: "NEW_MATCH"; totalRounds?: number; /** Fresh identities, for the next pair of teams. `colors` names them in the same step. */ nextTeams?: boolean; colors?: Record<TeamId, TeamColor> }
  /** Name a team by colour. A correction of who is displayed: it never touches scores or the round. */
  | { id: string; type: "SET_TEAM"; team: TeamId; color: TeamColor }
  | { id: string; type: "START_ROUND"; question: ReadyQuestionSnapshot; team: TeamId }
  | { id: string; type: "SET_CONTROL"; team: TeamId }
  | { id: string; type: "SHOW_BOARD" }
  | { id: string; type: "BEGIN_PLAY" }
  | { id: string; type: "FACEOFF_START" }
  /** The host taps the team whose standalone buzzer went first. */
  | { id: string; type: "BUZZ"; team: TeamId }
  | { id: string; type: "FACEOFF_MISS" }
  /** The hosts' call on who won the face-off. */
  | { id: string; type: "FACEOFF_WIN"; team: TeamId }
  | { id: string; type: "PLAY_OR_PASS"; choice: "play" | "pass" }
  | { id: string; type: "REVEAL"; answerId: string }
  | { id: string; type: "STRIKE" }
  | { id: string; type: "END_ROUND" }
  | { id: string; type: "AWARD" }
  | { id: string; type: "NEXT_ROUND" }
  | { id: string; type: "END_MATCH" }
  | { id: string; type: "ADJUST_SCORE"; team: TeamId; delta: number }
  | { id: string; type: "TIEBREAK" }
  | { id: string; type: "ABANDON_ROUND" };

export interface Session {
  state: GameState;
  history: GameState[];
}
