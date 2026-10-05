import {
  HISTORY_LIMIT,
  MAX_STRIKES,
  SEEN_LIMIT,
  type Action,
  type GameState,
  type RoundState,
  type Session,
  type Settlement,
  type TeamId,
} from "./types";
import { isTeamColor, teamLabel } from "../teams";

export const otherTeam = (t: TeamId): TeamId => (t === "A" ? "B" : "A");

export const initialState = (totalRounds = 3): GameState => ({
  phase: "lobby",
  teams: { A: { name: "Team A", score: 0 }, B: { name: "Team B", score: 0 } },
  roundsPlayed: 0,
  totalRounds,
  playedQuestionIds: [],
  tieBreakFrom: null,
  usedEarlier: [],
  round: null,
  note: null,
  seen: [],
});

export const initialSession = (totalRounds = 3): Session => ({ state: initialState(totalRounds), history: [] });

const withRound = (s: GameState, patch: Partial<RoundState>, extra: Partial<GameState> = {}): GameState => ({
  ...s,
  ...extra,
  round: s.round ? { ...s.round, ...patch } : s.round,
});

const refuse = (s: GameState, note: string): GameState => ({ ...s, note });

const settle = (r: RoundState): Settlement => {
  if (r.stealResult === "success") return { winner: otherTeam(r.controllingTeam), amount: r.pot, kind: "steal_success" };
  if (r.stealResult === "fail") return { winner: r.controllingTeam, amount: r.pot, kind: "steal_fail" };
  return { winner: r.controllingTeam, amount: r.pot, kind: r.cleared ? "clear" : "ended_early" };
};

const topCount = (r: RoundState) => Math.max(...r.answers.map((x) => x.count));

/** Who gives the next face-off answer: the first buzzer, then the other team (unless the top answer already settled it), then nobody. */
export const answering = (r: RoundState | null | undefined): TeamId | null => {
  const fo = r?.faceOff;
  if (!r || !fo?.buzzed || fo.winner) return null;
  if (!fo.tries[fo.buzzed]) return fo.buzzed;
  if (faceOffCall(r)) return null;
  const other = otherTeam(fo.buzzed);
  return fo.tries[other] ? null : other;
};

/**
 * Who the survey says has won the face-off so far, for the hosts to confirm; null while it is still open.
 * The top answer wins on the spot; otherwise the second player gets a go and the higher count wins, a tie going to
 * the first buzzer. Both missing is no result: the next two players go.
 */
export function faceOffCall(r: RoundState | null | undefined): TeamId | null {
  const fo = r?.faceOff;
  if (!r || !fo?.buzzed) return null;
  const first = fo.buzzed;
  const a = fo.tries[first];
  const b = fo.tries[otherTeam(first)];
  if (a && !b) return a.hit && a.count >= topCount(r) ? first : null;
  if (a && b) {
    if (b.hit && (!a.hit || b.count > a.count)) return otherTeam(first);
    if (a.hit) return first;
  }
  return null;
}

/** Record one face-off answer: a hit with its survey count, or a miss. The hosts call the winner, never the software. */
function faceOffTry(s: GameState, r: RoundState, hitCount: number | null): GameState {
  const fo = r.faceOff!;
  const tries = { ...fo.tries, [answering(r)!]: { hit: hitCount !== null, count: hitCount ?? 0 } };
  const bothMissed = !!tries.A && !!tries.B && !tries.A.hit && !tries.B.hit;
  return { ...s, round: { ...r, faceOff: { ...fo, tries } }, note: bothMissed ? "BOTH MISSED. NEXT PLAYERS." : null };
}

/** Pure rule step. Same state and action in, next state out. No timers, no I/O. */
export function step(prev: GameState, a: Action): GameState {
  if (prev.seen.includes(a.id)) return prev; // same input delivered twice
  const s: GameState = { ...prev, note: null, seen: [...prev.seen, a.id].slice(-SEEN_LIMIT) };
  const r = s.round;

  switch (a.type) {
    case "NEW_MATCH": {
      const fresh = initialState(a.totalRounds ?? s.totalRounds);
      // The next pair of teams: fresh identities (named now if both colours came with the request), and the
      // questions this audience has already seen stay marked.
      if (a.nextTeams) {
        const c = a.colors;
        const named = !!c && isTeamColor(c.A) && isTeamColor(c.B) && c.A !== c.B;
        const teams = named ? { A: { name: teamLabel(c.A), score: 0, color: c.A }, B: { name: teamLabel(c.B), score: 0, color: c.B } } : fresh.teams;
        return { ...fresh, teams, usedEarlier: [...new Set([...(s.usedEarlier ?? []), ...s.playedQuestionIds])], seen: s.seen };
      }
      return { ...fresh, teams: { A: { ...s.teams.A, score: 0 }, B: { ...s.teams.B, score: 0 } }, usedEarlier: s.usedEarlier ?? [], seen: s.seen };
    }

    case "SET_TEAM": {
      if (!isTeamColor(a.color) || s.teams[a.team].color === a.color) return s;
      if (s.teams[otherTeam(a.team)].color === a.color) return refuse(s, `${teamLabel(a.color)} is already the other team. Each team needs its own colour.`);
      return { ...s, teams: { ...s.teams, [a.team]: { ...s.teams[a.team], name: teamLabel(a.color), color: a.color } } };
    }

    case "START_ROUND": {
      if (s.phase !== "lobby") return refuse(s, "Finish the current round first.");
      if (s.roundsPlayed >= s.totalRounds) return refuse(s, "Match is complete.");
      if (s.playedQuestionIds.includes(a.question.id)) return refuse(s, "That question was already played this match.");
      if (a.question.answers.length < 1) return refuse(s, "Question has no answers.");
      return {
        ...s,
        phase: "intro",
        playedQuestionIds: [...s.playedQuestionIds, a.question.id],
        round: {
          roundId: `r${s.roundsPlayed + 1}-${a.question.id}`,
          questionId: a.question.id,
          category: a.question.category,
          prompt: a.question.prompt,
          demo: a.question.demo,
          answers: a.question.answers.map((x) => ({ ...x, aliases: [...x.aliases] })),
          controllingTeam: a.team,
          revealed: [],
          strikes: 0,
          pot: 0,
          stealResult: null,
          cleared: false,
          settlement: null,
          faceOff: null,
        },
      };
    }

    case "SET_CONTROL":
      if (!r || !(["intro", "board_ready", "face_off", "play_or_pass"] as string[]).includes(s.phase)) return refuse(s, "Starting team is fixed once play begins.");
      return withRound(s, { controllingTeam: a.team });

    case "SHOW_BOARD":
      return s.phase === "intro" ? { ...s, phase: "board_ready" } : s;

    // The host's own call: skip the face-off, or override it, and start the turn with whoever is in control.
    case "BEGIN_PLAY":
      return s.phase === "board_ready" || s.phase === "face_off" || s.phase === "play_or_pass" ? { ...s, phase: "team_turn" } : s;

    case "FACEOFF_START":
      if (s.phase !== "board_ready" || !r) return s;
      return { ...s, phase: "face_off", round: { ...r, faceOff: { buzzed: null, tries: {}, winner: null, choice: null } } };

    // The judges call which standalone buzzer went first and the host taps that team. A wrong tap can be corrected
    // before anyone answers, and a tap after both players missed starts the next attempt, but never mid-attempt.
    case "BUZZ": {
      const fo = r?.faceOff;
      if (s.phase !== "face_off" || !r || !fo || fo.winner) return prev;
      const tries = Object.values(fo.tries);
      // Mid-attempt, or an attempt with a hit waiting for the hosts' call: a tap cannot wipe it.
      if (tries.length === 1 || tries.some((t) => t?.hit)) return prev;
      return withRound(s, { faceOff: { ...fo, buzzed: a.team, tries: tries.length === 2 ? {} : fo.tries } });
    }

    // The hosts' call. Allowed at any point of the face-off, and once more to correct it before play or pass.
    case "FACEOFF_WIN": {
      const fo = r?.faceOff;
      if (!r || !fo || (s.phase !== "face_off" && s.phase !== "play_or_pass")) return refuse(s, "Start the face-off first.");
      const cleared = r.revealed.length >= r.answers.length; // a one-answer board can end at the face-off
      return { ...s, phase: cleared ? "round_over" : "play_or_pass", round: { ...r, controllingTeam: a.team, cleared, faceOff: { ...fo, winner: a.team, choice: null } } };
    }

    case "FACEOFF_MISS":
      if (s.phase !== "face_off" || !r?.faceOff || !answering(r)) return refuse(s, "Wait for a buzz first.");
      return faceOffTry(s, r, null);

    case "PLAY_OR_PASS": {
      const fo = r?.faceOff;
      if (s.phase !== "play_or_pass" || !r || !fo?.winner) return s;
      const controllingTeam = a.choice === "play" ? fo.winner : otherTeam(fo.winner);
      const note = `${s.teams[fo.winner].name.toUpperCase()} ${a.choice === "play" ? "PLAYS" : "PASSES"}`;
      return { ...s, phase: "team_turn", note, round: { ...r, controllingTeam, faceOff: { ...fo, choice: a.choice } } };
    }

    case "REVEAL": {
      if (!r) return s;
      const ans = r.answers.find((x) => x.id === a.answerId);
      if (!ans) return s;
      if (r.revealed.includes(ans.id)) return refuse(s, "ALREADY ON THE BOARD");
      const revealed = [...r.revealed, ans.id];
      if (s.phase === "face_off") {
        if (!answering(r)) return refuse(s, "Wait for a buzz first.");
        return faceOffTry(s, { ...r, revealed, pot: r.pot + ans.count }, ans.count);
      }
      if (s.phase === "team_turn") {
        // A cleared board ends the round; the pot waits for one explicit award.
        const cleared = revealed.length >= r.answers.length;
        return withRound(s, { revealed, pot: r.pot + ans.count, cleared }, cleared ? { phase: "round_over" } : {});
      }
      if (s.phase === "steal") {
        return withRound(s, { revealed, pot: r.pot + ans.count, stealResult: "success" }, { phase: "round_over" });
      }
      if (s.phase === "round_over") return withRound(s, { revealed }); // discussion only: pot untouched
      return refuse(s, "Reveals open once play begins.");
    }

    case "STRIKE": {
      if (!r) return s;
      if (s.phase === "steal") return withRound(s, { stealResult: "fail" }, { phase: "round_over" });
      if (s.phase !== "team_turn") return refuse(s, "Strikes apply during a team turn.");
      const strikes = Math.min(MAX_STRIKES, r.strikes + 1);
      return withRound(s, { strikes }, strikes >= MAX_STRIKES ? { phase: "steal" } : {});
    }

    case "END_ROUND":
      return s.phase === "team_turn" && r ? { ...s, phase: "round_over" } : refuse(s, "Only a live team turn can be ended early.");

    case "AWARD": {
      if (s.phase !== "round_over" || !r || r.settlement) return s; // repeated award is a no-op
      const settlement = settle(r);
      const teams = {
        ...s.teams,
        [settlement.winner]: { ...s.teams[settlement.winner], score: s.teams[settlement.winner].score + settlement.amount },
      };
      return withRound({ ...s, teams }, { settlement });
    }

    case "NEXT_ROUND": {
      if (s.phase !== "round_over" || !r?.settlement) return refuse(s, "Award the round first.");
      const roundsPlayed = s.roundsPlayed + 1;
      return { ...s, roundsPlayed, round: null, phase: roundsPlayed >= s.totalRounds ? "match_over" : "lobby" };
    }

    case "END_MATCH":
      if (s.phase === "lobby" || (s.phase === "round_over" && r?.settlement)) {
        return { ...s, round: null, phase: "match_over", roundsPlayed: s.roundsPlayed + (r ? 1 : 0) };
      }
      return refuse(s, "Settle the round before ending the match.");

    case "ADJUST_SCORE": {
      if (!Number.isInteger(a.delta) || a.delta === 0) return s;
      const t = s.teams[a.team];
      return { ...s, teams: { ...s.teams, [a.team]: { ...t, score: t.score + a.delta } } };
    }

    // A finished, level match gets one more round. It plays like any other, so it has its own face-off and steal.
    case "TIEBREAK":
      if (s.phase !== "match_over" || s.teams.A.score !== s.teams.B.score) return refuse(s, "A tie-break needs a finished match that is level.");
      return { ...s, phase: "lobby", totalRounds: s.roundsPlayed + 1, tieBreakFrom: s.tieBreakFrom ?? s.roundsPlayed };

    case "ABANDON_ROUND": {
      // Drop an unsettled round without scoring. A round with no play yet releases its question.
      if (!r || r.settlement) return refuse(s, "Nothing to abandon.");
      const untouched = r.revealed.length === 0 && r.strikes === 0;
      return { ...s, round: null, phase: "lobby", playedQuestionIds: untouched ? s.playedQuestionIds.filter((q) => q !== r.questionId) : s.playedQuestionIds };
    }
  }
}

/** Session = state + undo history. UNDO is handled here so `step` stays a plain function. */
export function apply(session: Session, a: Action | { id: string; type: "UNDO" }): Session {
  if (a.type === "UNDO") {
    if (session.state.seen.includes(a.id)) return session;
    const prev = session.history[session.history.length - 1];
    if (!prev) return session;
    // Keep the seen-ids of "now" so a replay of an older input still cannot sneak back in.
    return {
      state: { ...prev, seen: [...session.state.seen, a.id].slice(-SEEN_LIMIT), note: null },
      history: session.history.slice(0, -1),
    };
  }
  const next = step(session.state, a);
  if (next === session.state) return session;
  // Notes and ignored duplicates are not undoable events.
  const changed = next.phase !== session.state.phase || next.round !== session.state.round || next.teams !== session.state.teams || next.roundsPlayed !== session.state.roundsPlayed;
  if (!changed) return { state: next, history: session.history };
  const kept = a.type === "NEW_MATCH" ? [] : [...session.history, session.state].slice(-HISTORY_LIMIT);
  return { state: next, history: kept };
}
