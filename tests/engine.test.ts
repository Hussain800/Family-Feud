import { describe, expect, it } from "vitest";
import { apply, initialSession } from "../src/engine/reducer";
import type { Action, ReadyQuestionSnapshot, Session } from "../src/engine/types";

// Invented numbers used only to pin the rules down.
const Q: ReadyQuestionSnapshot = {
  id: "q01",
  category: "Student Life",
  prompt: "Name something students do instead of studying.",
  demo: true,
  answers: [
    { id: "a1", rank: 1, text: "One", count: 30, aliases: [] },
    { id: "a2", rank: 2, text: "Two", count: 12, aliases: [] },
    { id: "a3", rank: 3, text: "Three", count: 8, aliases: [] },
  ],
};

let n = 0;
const act = <T extends Action["type"]>(type: T, rest: Omit<Extract<Action, { type: T }>, "id" | "type"> = {} as never): Action =>
  ({ id: `cmd${++n}`, type, ...rest }) as Action;

const run = (s: Session, ...actions: Action[]) => actions.reduce(apply, s);
const toTurn = (team: "A" | "B" = "A") =>
  run(initialSession(), act("START_ROUND", { question: Q, team }), act("SHOW_BOARD"), act("BEGIN_PLAY"));
const strikeThrice = (s: Session) => run(s, act("STRIKE"), act("STRIKE"), act("STRIKE"));

describe("reveals", () => {
  it("adds a reveal once; the same input delivered twice adds nothing", () => {
    const reveal = act("REVEAL", { answerId: "a1" });
    const s = run(toTurn(), reveal, reveal);
    expect(s.state.round!.pot).toBe(30);
    expect(s.state.round!.revealed).toEqual(["a1"]);
  });

  it("a second deliberate reveal of the same answer is ALREADY ON THE BOARD: no points, no strike", () => {
    const s = run(toTurn(), act("REVEAL", { answerId: "a1" }), act("REVEAL", { answerId: "a1" }));
    expect(s.state.round!.pot).toBe(30);
    expect(s.state.round!.strikes).toBe(0);
    expect(s.state.note).toBe("ALREADY ON THE BOARD");
  });

  it("reveals after settlement are discussion only", () => {
    let s = run(toTurn(), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"));
    expect(s.state.teams.A.score).toBe(30);
    s = run(s, act("REVEAL", { answerId: "a2" }), act("REVEAL", { answerId: "a3" }));
    expect(s.state.round!.revealed).toHaveLength(3);
    expect(s.state.round!.pot).toBe(30);
    expect(s.state.teams.A.score).toBe(30);
    expect(s.state.teams.B.score).toBe(0);
  });

  it("refuses reveals before play begins", () => {
    const s = run(initialSession(), act("START_ROUND", { question: Q, team: "A" }), act("REVEAL", { answerId: "a1" }));
    expect(s.state.round!.revealed).toEqual([]);
  });
});

describe("strikes", () => {
  it("two deliberately issued strikes count twice, one strike delivered twice counts once", () => {
    const two = run(toTurn(), act("STRIKE"), act("STRIKE"));
    expect(two.state.round!.strikes).toBe(2);
    const once = act("STRIKE");
    expect(run(toTurn(), once, once).state.round!.strikes).toBe(1);
  });

  it("the third deliberate strike enters steal; a repeat delivery of it does nothing", () => {
    const third = act("STRIKE");
    const s = run(toTurn(), act("STRIKE"), act("STRIKE"), third, third);
    expect(s.state.phase).toBe("steal");
    expect(s.state.round!.strikes).toBe(3);
  });
});

describe("settlement", () => {
  it("clear board awards the pot to the controlling team once", () => {
    const award = act("AWARD");
    let s = run(toTurn("B"), act("REVEAL", { answerId: "a1" }), act("REVEAL", { answerId: "a2" }), act("REVEAL", { answerId: "a3" }));
    expect(s.state.phase).toBe("round_over");
    s = run(s, award, award, act("AWARD"));
    expect(s.state.teams.B.score).toBe(50);
    expect(s.state.teams.A.score).toBe(0);
    expect(s.state.round!.settlement).toEqual({ winner: "B", amount: 50, kind: "clear" });
  });

  it("successful steal: stealing team receives pot plus the stolen answer", () => {
    let s = run(toTurn("A"), act("REVEAL", { answerId: "a2" }), ...[act("STRIKE"), act("STRIKE"), act("STRIKE")]);
    expect(s.state.phase).toBe("steal");
    s = run(s, act("REVEAL", { answerId: "a3" }), act("AWARD"));
    expect(s.state.round!.settlement).toEqual({ winner: "B", amount: 20, kind: "steal_success" });
    expect(s.state.teams).toMatchObject({ A: { score: 0 }, B: { score: 20 } });
  });

  it("failed steal: original team keeps the pot, steal adds nothing", () => {
    let s = run(toTurn("A"), act("REVEAL", { answerId: "a1" }));
    s = strikeThrice(s);
    s = run(s, act("STRIKE"), act("AWARD")); // STRIKE during steal = missed steal
    expect(s.state.round!.stealResult).toBe("fail");
    expect(s.state.round!.settlement).toEqual({ winner: "A", amount: 30, kind: "steal_fail" });
    expect(s.state.teams).toMatchObject({ A: { score: 30 }, B: { score: 0 } });
  });

  it("steal guess already on the board is not an attempt and not a strike", () => {
    let s = strikeThrice(run(toTurn(), act("REVEAL", { answerId: "a1" })));
    s = run(s, act("REVEAL", { answerId: "a1" }));
    expect(s.state.phase).toBe("steal");
    expect(s.state.round!.pot).toBe(30);
  });

  it("award is impossible before the round ends", () => {
    const s = run(toTurn(), act("REVEAL", { answerId: "a1" }), act("AWARD"));
    expect(s.state.teams.A.score).toBe(0);
  });

  it("next round resets pot, strikes, reveals but keeps scores; match ends after the last round", () => {
    let s = run(initialSession(1), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"));
    s = run(s, act("NEXT_ROUND"));
    expect(s.state.phase).toBe("match_over");
    expect(s.state.round).toBeNull();
    expect(s.state.teams.A.score).toBe(30);

    let two = run(initialSession(2), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"), act("NEXT_ROUND"));
    expect(two.state.phase).toBe("lobby");
    expect(two.state.teams.A.score).toBe(30);
    two = run(two, act("START_ROUND", { question: { ...Q, id: "q03" }, team: "B" }));
    expect(two.state.round).toMatchObject({ pot: 0, strikes: 0, revealed: [] });
  });

  it("a tied match is a valid end state", () => {
    const s = run(initialSession(1), act("ADJUST_SCORE", { team: "A", delta: 10 }), act("ADJUST_SCORE", { team: "B", delta: 10 }), act("END_MATCH"));
    expect(s.state.phase).toBe("match_over");
    expect(s.state.teams.A.score).toBe(s.state.teams.B.score);
  });

  it("a played question cannot start again; an untouched abandoned one can", () => {
    const played = run(
      initialSession(3),
      act("START_ROUND", { question: Q, team: "A" }),
      act("SHOW_BOARD"),
      act("BEGIN_PLAY"),
      act("REVEAL", { answerId: "a1" }),
      act("END_ROUND"),
      act("AWARD"),
      act("NEXT_ROUND"),
      act("START_ROUND", { question: Q, team: "B" }),
    );
    expect(played.state.round).toBeNull();
    expect(played.state.note).toMatch(/already played/);

    const released = run(
      initialSession(3),
      act("START_ROUND", { question: Q, team: "A" }),
      act("ABANDON_ROUND"),
      act("START_ROUND", { question: Q, team: "A" }),
    );
    expect(released.state.round?.questionId).toBe("q01");
  });
});

describe("corrections", () => {
  it("undo of a reveal restores the pot", () => {
    const s = run(toTurn(), act("REVEAL", { answerId: "a1" }), { id: "u1", type: "UNDO" } as never);
    expect(s.state.round!.pot).toBe(0);
    expect(s.state.round!.revealed).toEqual([]);
  });

  it("undo of a settlement reverses exactly the recorded award, even if the pack changed since", () => {
    let s = run(toTurn("A"), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"));
    expect(s.state.teams.A.score).toBe(30);
    // Frozen answers mean a pack edit cannot alter what undo subtracts: undo restores the snapshot.
    s = apply(s, { id: "u2", type: "UNDO" });
    expect(s.state.teams.A.score).toBe(0);
    expect(s.state.round!.settlement).toBeNull();
    expect(s.state.phase).toBe("round_over");
    s = apply(s, act("AWARD"));
    expect(s.state.teams.A.score).toBe(30);
  });

  it("undo delivered twice undoes once", () => {
    let s = run(toTurn(), act("REVEAL", { answerId: "a1" }), act("REVEAL", { answerId: "a2" }));
    const undo = { id: "u3", type: "UNDO" } as const;
    s = apply(apply(s, undo), undo);
    expect(s.state.round!.revealed).toEqual(["a1"]);
  });

  it("explicit score correction is undoable", () => {
    let s = run(initialSession(), act("ADJUST_SCORE", { team: "B", delta: 7 }));
    expect(s.state.teams.B.score).toBe(7);
    s = apply(s, { id: "u4", type: "UNDO" });
    expect(s.state.teams.B.score).toBe(0);
  });
});

describe("new match", () => {
  it("resets scores but keeps team names", () => {
    let s = run(initialSession(), act("SET_TEAM_NAMES", { names: { A: "Foxes", B: "Owls" } }), act("ADJUST_SCORE", { team: "A", delta: 9 }));
    s = apply(s, act("NEW_MATCH"));
    expect(s.state.teams).toEqual({ A: { name: "Foxes", score: 0 }, B: { name: "Owls", score: 0 } });
    expect(s.history).toEqual([]);
  });
});

describe("face-off", () => {
  const toFace = (q: ReadyQuestionSnapshot = Q) =>
    run(initialSession(), act("START_ROUND", { question: q, team: "A" }), act("SHOW_BOARD"), act("FACEOFF_START"));
  const reveal = (id: string) => act("REVEAL", { answerId: id });
  const tie: ReadyQuestionSnapshot = {
    ...Q,
    id: "q-tie",
    answers: [
      { id: "t1", rank: 1, text: "Top", count: 20, aliases: [] },
      { id: "t2", rank: 2, text: "Mid", count: 10, aliases: [] },
      { id: "t3", rank: 3, text: "Mid too", count: 10, aliases: [] },
    ],
  };

  it("the host's tap records which standalone buzzer was first, and can correct a wrong tap before anyone answers", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }));
    expect(s.state.round!.faceOff).toMatchObject({ buzzed: "A" });
    s = run(s, act("BUZZ", { team: "B" })); // wrong tap, corrected
    expect(s.state.round!.faceOff!.buzzed).toBe("B");
    s = run(s, reveal("a1"));
    expect(s.state.round!.faceOff!.winner).toBe("B");
  });

  it("taps before the face-off starts, or after it is decided, do nothing", () => {
    const before = run(initialSession(), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BUZZ", { team: "A" }));
    expect(before.state.phase).toBe("board_ready");
    const done = run(toFace(), act("BUZZ", { team: "A" }), reveal("a1"), act("BUZZ", { team: "B" }));
    expect(done.state.round!.faceOff!.buzzed).toBe("A");
  });

  it("the same tap delivered twice is one tap", () => {
    const tap = act("BUZZ", { team: "A" });
    const s = run(toFace(), tap, tap);
    expect(s.state.round!.faceOff!.buzzed).toBe("A");
  });

  it("the top answer from the first buzzer wins on the spot; play keeps control, the pot carries over", () => {
    let s = run(toFace(), act("BUZZ", { team: "B" }), reveal("a1"));
    expect(s.state.phase).toBe("play_or_pass");
    expect(s.state.round!.faceOff!.winner).toBe("B");
    expect(s.state.round!.pot).toBe(30);
    s = run(s, act("PLAY_OR_PASS", { choice: "play" }));
    expect(s.state.phase).toBe("team_turn");
    expect(s.state.round).toMatchObject({ controllingTeam: "B", pot: 30, strikes: 0 });
  });

  it("pass hands control over, and the passing team gets none of the pot", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a1"), act("PLAY_OR_PASS", { choice: "pass" }));
    expect(s.state.round!.controllingTeam).toBe("B");
    expect(s.state.note).toMatch(/PASSES/);
    s = run(s, act("END_ROUND"), act("AWARD"));
    expect(s.state.teams).toMatchObject({ A: { score: 0 }, B: { score: 30 } });
  });

  it("a lower answer gives the other player a go: the higher survey count wins and both answers sit in the pot", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a2"));
    expect(s.state.phase).toBe("face_off");
    s = run(s, reveal("a1"));
    expect(s.state.round!.faceOff!.winner).toBe("B");
    expect(s.state.round!.pot).toBe(42);
    expect(s.state.phase).toBe("play_or_pass");
  });

  it("a tie on points goes to the first buzzer", () => {
    const s = run(toFace(tie), act("BUZZ", { team: "B" }), reveal("t2"), reveal("t3"));
    expect(s.state.round!.faceOff!.winner).toBe("B");
  });

  it("if the second player misses, the first player's answer wins; if the first misses and the second hits, the second wins", () => {
    expect(run(toFace(), act("BUZZ", { team: "A" }), reveal("a2"), act("FACEOFF_MISS")).state.round!.faceOff!.winner).toBe("A");
    expect(run(toFace(), act("BUZZ", { team: "A" }), act("FACEOFF_MISS"), reveal("a3")).state.round!.faceOff!.winner).toBe("B");
  });

  it("both missing names no winner and costs no strike; the next tap starts the next attempt", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), act("FACEOFF_MISS"), act("FACEOFF_MISS"));
    expect(s.state.phase).toBe("face_off");
    expect(s.state.round!.faceOff!.winner).toBeNull();
    expect(s.state.round!.strikes).toBe(0);
    expect(s.state.note).toMatch(/BOTH MISSED/);
    s = run(s, act("BUZZ", { team: "B" }));
    expect(s.state.round!.faceOff).toMatchObject({ buzzed: "B", tries: {} });
    s = run(s, reveal("a1"));
    expect(s.state.round!.faceOff!.winner).toBe("B");
  });

  it("a tap cannot overwrite an attempt in progress", () => {
    const mid = run(toFace(), act("BUZZ", { team: "A" }), reveal("a2"), act("BUZZ", { team: "B" }));
    expect(mid.state.round!.faceOff).toMatchObject({ buzzed: "A" });
    expect(mid.state.round!.faceOff!.tries.A).toBeDefined();
  });

  it("strikes do not exist in a face-off, and reveals wait for a tap", () => {
    let s = run(toFace(), act("STRIKE"), reveal("a1"));
    expect(s.state.round!.strikes).toBe(0);
    expect(s.state.round!.revealed).toEqual([]);
    s = run(toFace(), act("BUZZ", { team: "A" }), act("STRIKE"));
    expect(s.state.round!.strikes).toBe(0);
  });

  it("repeating a shown answer is ALREADY ON THE BOARD and does not use the other player's turn", () => {
    const s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a2"), reveal("a2"));
    expect(s.state.note).toBe("ALREADY ON THE BOARD");
    expect(s.state.round!.faceOff!.tries.B).toBeUndefined();
    expect(s.state.round!.pot).toBe(12);
  });

  it("a one-answer board cleared at the face-off goes straight to the award", () => {
    const one: ReadyQuestionSnapshot = { ...Q, id: "q-one", answers: [Q.answers[0]] };
    let s = run(toFace(one), act("BUZZ", { team: "A" }), reveal("a1"));
    expect(s.state.phase).toBe("round_over");
    s = run(s, act("AWARD"));
    expect(s.state.teams.A.score).toBe(30);
  });

  it("the host can skip or override the face-off", () => {
    let s = run(toFace(), act("SET_CONTROL", { team: "B" }), act("BEGIN_PLAY"));
    expect(s.state).toMatchObject({ phase: "team_turn" });
    expect(s.state.round!.controllingTeam).toBe("B");
    s = run(initialSession(), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"));
    expect(s.state.phase).toBe("team_turn"); // no face-off at all: the old flow is intact
  });

  it("undo steps back through a tap and a result", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a1"));
    s = apply(s, { id: "u-f1", type: "UNDO" });
    expect(s.state.round!.faceOff).toMatchObject({ buzzed: "A", winner: null });
    expect(s.state.round!.pot).toBe(0);
    s = apply(s, { id: "u-f2", type: "UNDO" });
    expect(s.state.round!.faceOff).toMatchObject({ buzzed: null });
  });
});

describe("tie-break", () => {
  const level = (rounds = 1) => run(initialSession(rounds), act("ADJUST_SCORE", { team: "A", delta: 10 }), act("ADJUST_SCORE", { team: "B", delta: 10 }), act("END_MATCH"));
  const playAndAward = (s: Session, qid: string, team: "A" | "B") =>
    run(s, act("START_ROUND", { question: { ...Q, id: qid }, team }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"), act("NEXT_ROUND"));

  it("only a finished, level match can be extended", () => {
    expect(run(initialSession(), act("TIEBREAK")).state.phase).toBe("lobby");
    const lead = run(initialSession(1), act("ADJUST_SCORE", { team: "A", delta: 5 }), act("END_MATCH"), act("TIEBREAK"));
    expect(lead.state.phase).toBe("match_over");
    expect(lead.state.note).toMatch(/level/);
  });

  it("a level match gets exactly one more round, marked as a tie-break", () => {
    const s = run(level(), act("TIEBREAK"));
    expect(s.state).toMatchObject({ phase: "lobby", totalRounds: 1, tieBreakFrom: 0 });
    const r = run(initialSession(2), act("ADJUST_SCORE", { team: "A", delta: 3 }), act("ADJUST_SCORE", { team: "B", delta: 3 }));
    const two = playAndAward(playAndAward(r, "q01", "A"), "q02", "B"); // 2 rounds: A 33, B 33
    const level2 = run(two, act("TIEBREAK"));
    expect(level2.state).toMatchObject({ phase: "lobby", totalRounds: 3, tieBreakFrom: 2 });
  });

  it("the tie-break round settles the match, or the match can go level again and be extended again", () => {
    let s = playAndAward(run(level(), act("TIEBREAK")), "q05", "A");
    expect(s.state.phase).toBe("match_over");
    expect(s.state.teams.A.score).toBeGreaterThan(s.state.teams.B.score);
    // level again after an awarded round: correct B up to A, then extend again
    s = run(s, act("ADJUST_SCORE", { team: "B", delta: 30 }), act("TIEBREAK"));
    expect(s.state).toMatchObject({ phase: "lobby", totalRounds: 2, tieBreakFrom: 0 }); // the first tie-break point is kept
  });

  it("undo steps back to the finished tie, and a new match clears the tie-break", () => {
    let s = run(level(), act("TIEBREAK"));
    s = apply(s, { id: "u-tb", type: "UNDO" });
    expect(s.state.phase).toBe("match_over");
    s = run(s, act("TIEBREAK"), act("NEW_MATCH"));
    expect(s.state.tieBreakFrom).toBeNull();
  });
});

