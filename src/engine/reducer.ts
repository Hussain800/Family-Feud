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

export const otherTeam = (t: TeamId): TeamId => (t === "A" ? "B" : "A");

export const initialState = (totalRounds = 3): GameState => ({
  phase: "lobby",
  teams: { A: { name: "Team A", score: 0 }, B: { name: "Team B", score: 0 } },
  roundsPlayed: 0,
  totalRounds,
  playedQuestionIds: [],
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

/** Pure rule step. Same state and action in, next state out. No timers, no I/O. */
export function step(prev: GameState, a: Action): GameState {
  if (prev.seen.includes(a.id)) return prev; // same input delivered twice
  const s: GameState = { ...prev, note: null, seen: [...prev.seen, a.id].slice(-SEEN_LIMIT) };
  const r = s.round;

  switch (a.type) {
    case "NEW_MATCH":
      return { ...initialState(a.totalRounds ?? s.totalRounds), teams: { A: { name: s.teams.A.name, score: 0 }, B: { name: s.teams.B.name, score: 0 } }, seen: s.seen };

    case "SET_TEAM_NAMES": {
      const clean = (n: string, fb: string) => n.trim().slice(0, 24) || fb;
      return {
        ...s,
        teams: {
          A: { ...s.teams.A, name: clean(a.names.A, "Team A") },
          B: { ...s.teams.B, name: clean(a.names.B, "Team B") },
        },
      };
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
        },
      };
    }

    case "SET_CONTROL":
      if (!r || (s.phase !== "intro" && s.phase !== "board_ready")) return refuse(s, "Starting team is fixed once play begins.");
      return withRound(s, { controllingTeam: a.team });

    case "SHOW_BOARD":
      return s.phase === "intro" ? { ...s, phase: "board_ready" } : s;

    case "BEGIN_PLAY":
      return s.phase === "board_ready" ? { ...s, phase: "team_turn" } : s;

    case "REVEAL": {
      if (!r) return s;
      const ans = r.answers.find((x) => x.id === a.answerId);
      if (!ans) return s;
      if (r.revealed.includes(ans.id)) return refuse(s, "ALREADY ON THE BOARD");
      const revealed = [...r.revealed, ans.id];
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
