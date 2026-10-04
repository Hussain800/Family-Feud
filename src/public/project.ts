import { DEMO_LABEL } from "../content/types";
import type { FaceOff, GameState } from "../engine/types";
import { publicPoll, type PollState } from "../poll/poll";
import type { PublicFaceOff, PublicSlot, PublicSnapshot, RelayStatus } from "./types";

export interface ProjectInput {
  rev: number;
  game: GameState;
  demo: boolean;
  room: { code: string | null; joinUrl: string | null; status: RelayStatus; connected: number; capacity: number };
  poll: PollState | null;
  timer?: { endsAt: number; durationMs: number } | null;
  now: number;
  /** Template preview: show a question with empty lines, no scores. */
  preview: { category: string; prompt: string } | null;
}

export const PREVIEW_SLOTS = 6;

/**
 * Build the public view from an explicit allowlist. Hidden answer text, counts, aliases and
 * survey metadata are never read here except for answers already revealed.
 */
export function projectPublic(i: ProjectInput): PublicSnapshot {
  const { game, preview } = i;
  const r = game.round;
  let round: PublicSnapshot["round"] = null;

  if (preview) {
    round = {
      number: 0,
      total: 0,
      category: preview.category,
      prompt: preview.prompt,
      columns: 1,
      slots: Array.from({ length: PREVIEW_SLOTS }, (_, k): PublicSlot => ({ index: k + 1, revealed: false })),
    };
  } else if (r) {
    const shown = new Set(r.revealed);
    round = {
      number: game.roundsPlayed + 1,
      total: game.totalRounds,
      category: r.category,
      prompt: r.prompt,
      columns: r.answers.length > 6 ? 2 : 1,
      slots: r.answers.map(
        (a, k): PublicSlot => (shown.has(a.id) ? { index: k + 1, revealed: true, text: a.text, count: a.count } : { index: k + 1, revealed: false }),
      ),
    };
  }

  return {
    rev: i.rev,
    demoLabel: i.demo ? DEMO_LABEL : null,
    room: { ...i.room },
    phase: preview ? "preview" : game.phase,
    teams: [
      { id: "A", name: game.teams.A.name, score: game.teams.A.score },
      { id: "B", name: game.teams.B.name, score: game.teams.B.score },
    ],
    control: preview ? null : (r?.controllingTeam ?? null),
    pot: preview ? 0 : (r?.pot ?? 0),
    strikes: preview ? 0 : (r?.strikes ?? 0),
    round,
    progress: { played: game.roundsPlayed, total: game.totalRounds, tieBreak: game.tieBreakFrom != null && game.roundsPlayed >= game.tieBreakFrom },
    timer: preview ? null : (i.timer ?? null),
    note: game.note,
    settlement: r?.settlement ? { winner: r.settlement.winner, amount: r.settlement.amount, kind: r.settlement.kind } : null,
    poll: i.poll && i.poll.status !== "cancelled" ? publicPoll(i.poll, i.now) : null,
    faceOff: !preview && r?.faceOff ? publicFaceOff(r.faceOff) : null,
  };
}

const outcome = (t: { hit: boolean } | undefined) => (t ? (t.hit ? ("hit" as const) : ("miss" as const)) : null);

function publicFaceOff(f: FaceOff): PublicFaceOff {
  return { armed: f.armed, buzzed: f.buzzed, tries: { A: outcome(f.tries.A), B: outcome(f.tries.B) }, winner: f.winner, choice: f.choice };
}
