import { describe, expect, it } from "vitest";
import { apply, faceOffCall, initialSession } from "../src/engine/reducer";
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
  it("resets scores but keeps team identities", () => {
    let s = run(initialSession(), act("SET_TEAM", { team: "A", color: "red" }), act("SET_TEAM", { team: "B", color: "blue" }), act("ADJUST_SCORE", { team: "A", delta: 9 }));
    s = apply(s, act("NEW_MATCH"));
    expect(s.state.teams).toEqual({ A: { name: "Team Red", score: 0, color: "red" }, B: { name: "Team Blue", score: 0, color: "blue" } });
    expect(s.history).toEqual([]);
  });

  it("the next pair of teams gets fresh identities and scores; questions already played stay marked", () => {
    let s = run(initialSession(), act("SET_TEAM", { team: "A", color: "red" }), act("SET_TEAM", { team: "B", color: "blue" }), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"), act("NEXT_ROUND"));
    s = apply(s, act("NEW_MATCH", { nextTeams: true }));
    expect(s.state).toMatchObject({ phase: "lobby", roundsPlayed: 0, playedQuestionIds: [], usedEarlier: ["q01"] });
    expect(s.state.teams).toEqual({ A: { name: "Team A", score: 0 }, B: { name: "Team B", score: 0 } }); // no colour carried over
    s = run(s, act("START_ROUND", { question: Q, team: "A" }));
    expect(s.state.phase).toBe("intro"); // still playable if the host chooses it
    s = run(s, act("ABANDON_ROUND"), act("NEW_MATCH"));
    expect(s.state.usedEarlier).toEqual(["q01"]); // a plain new match keeps the mark
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

  const call = (s: Session) => faceOffCall(s.state.round);
  const win = (team: "A" | "B") => act("FACEOFF_WIN", { team });

  it("the host's tap records which standalone buzzer was first, and can correct a wrong tap before anyone answers", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }));
    expect(s.state.round!.faceOff).toMatchObject({ buzzed: "A" });
    s = run(s, act("BUZZ", { team: "B" })); // wrong tap, corrected
    expect(s.state.round!.faceOff!.buzzed).toBe("B");
    s = run(s, reveal("a1"));
    expect(call(s)).toBe("B");
  });

  it("a buzz decides who answers first, never who wins: the face-off waits for the hosts' call", () => {
    const s = run(toFace(), act("BUZZ", { team: "B" }), reveal("a1"));
    expect(s.state.phase).toBe("face_off");
    expect(s.state.round!.faceOff!.winner).toBeNull();
    expect(call(s)).toBe("B"); // the survey's suggestion, shown to the host only
    const after = run(s, reveal("a2"), act("FACEOFF_MISS"));
    expect(after.state.round!.revealed).toEqual(["a1"]); // the top answer settled it: the other player does not answer
    expect(after.state.round!.faceOff!.tries.A).toBeUndefined();
  });

  it("taps before the face-off starts, or after it is decided, do nothing", () => {
    const before = run(initialSession(), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BUZZ", { team: "A" }));
    expect(before.state.phase).toBe("board_ready");
    const done = run(toFace(), act("BUZZ", { team: "A" }), reveal("a1"), win("A"), act("BUZZ", { team: "B" }));
    expect(done.state.round!.faceOff!.buzzed).toBe("A");
    const pending = run(toFace(), act("BUZZ", { team: "A" }), reveal("a2"), act("FACEOFF_MISS"), act("BUZZ", { team: "B" }));
    expect(pending.state.round!.faceOff!.tries.A).toMatchObject({ hit: true }); // a hit awaiting the call is not wiped
  });

  it("the same tap delivered twice is one tap", () => {
    const tap = act("BUZZ", { team: "A" });
    const s = run(toFace(), tap, tap);
    expect(s.state.round!.faceOff!.buzzed).toBe("A");
  });

  it("the hosts' call starts play or pass; play keeps control and the pot carries over once", () => {
    let s = run(toFace(), act("BUZZ", { team: "B" }), reveal("a1"), win("B"));
    expect(s.state.phase).toBe("play_or_pass");
    expect(s.state.round!.faceOff!.winner).toBe("B");
    expect(s.state.round!.pot).toBe(30);
    s = run(s, act("PLAY_OR_PASS", { choice: "play" }));
    expect(s.state.phase).toBe("team_turn");
    expect(s.state.round).toMatchObject({ controllingTeam: "B", pot: 30, strikes: 0 });
  });

  it("the hosts can call it against the survey, or change their call before play or pass", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a1"), win("B"));
    expect(s.state.round).toMatchObject({ controllingTeam: "B", pot: 30 });
    s = run(s, win("A"));
    expect(s.state.round).toMatchObject({ controllingTeam: "A", pot: 30 });
    expect(s.state.phase).toBe("play_or_pass");
    expect(run(toFace(), win("B")).state.round!.faceOff!.winner).toBe("B"); // no buzz needed for a straight call
  });

  it("pass hands control over, and the passing team gets none of the pot", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a1"), win("A"), act("PLAY_OR_PASS", { choice: "pass" }));
    expect(s.state.round!.controllingTeam).toBe("B");
    expect(s.state.note).toMatch(/PASSES/);
    s = run(s, act("END_ROUND"), act("AWARD"));
    expect(s.state.teams).toMatchObject({ A: { score: 0 }, B: { score: 30 } });
  });

  it("a lower answer gives the other player a go: the higher survey count is suggested and both answers sit in the pot", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a2"));
    expect(call(s)).toBeNull();
    s = run(s, reveal("a1"));
    expect(call(s)).toBe("B");
    expect(s.state.round!.pot).toBe(42);
  });

  it("a tie on points is suggested for the first buzzer", () => {
    expect(call(run(toFace(tie), act("BUZZ", { team: "B" }), reveal("t2"), reveal("t3")))).toBe("B");
  });

  it("if the second player misses, the first player's answer is suggested; if the first misses and the second hits, the second", () => {
    expect(call(run(toFace(), act("BUZZ", { team: "A" }), reveal("a2"), act("FACEOFF_MISS")))).toBe("A");
    expect(call(run(toFace(), act("BUZZ", { team: "A" }), act("FACEOFF_MISS"), reveal("a3")))).toBe("B");
  });

  it("both missing suggests nobody and costs no strike; the next tap starts the next attempt", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), act("FACEOFF_MISS"), act("FACEOFF_MISS"));
    expect(s.state.phase).toBe("face_off");
    expect(call(s)).toBeNull();
    expect(s.state.round!.strikes).toBe(0);
    expect(s.state.note).toMatch(/BOTH MISSED/);
    s = run(s, act("BUZZ", { team: "B" }));
    expect(s.state.round!.faceOff).toMatchObject({ buzzed: "B", tries: {} });
    s = run(s, reveal("a1"));
    expect(call(s)).toBe("B");
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
    let s = run(toFace(one), act("BUZZ", { team: "A" }), reveal("a1"), win("A"));
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

  it("undo steps back through a call, a result and a tap", () => {
    let s = run(toFace(), act("BUZZ", { team: "A" }), reveal("a1"), win("A"));
    s = apply(s, { id: "u-f0", type: "UNDO" });
    expect(s.state).toMatchObject({ phase: "face_off" });
    expect(s.state.round!.faceOff!.winner).toBeNull();
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


describe("team colours", () => {
  const withRound = () => run(initialSession(), act("SET_TEAM", { team: "A", color: "yellow" }), act("SET_TEAM", { team: "B", color: "green" }), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a2" }), act("ADJUST_SCORE", { team: "B", delta: 7 }));

  it("names the team by its colour and keeps the engine slots A and B", () => {
    const s = run(initialSession(), act("SET_TEAM", { team: "B", color: "black" }), act("SET_TEAM", { team: "A", color: "white" }));
    expect(s.state.teams.A).toEqual({ name: "Team White", score: 0, color: "white" });
    expect(s.state.teams.B).toEqual({ name: "Team Black", score: 0, color: "black" });
  });

  it("refuses the same colour for both teams and says why", () => {
    const s = run(initialSession(), act("SET_TEAM", { team: "A", color: "red" }), act("SET_TEAM", { team: "B", color: "red" }));
    expect(s.state.teams.B.color).toBeUndefined();
    expect(s.state.note).toMatch(/already the other team/);
  });

  it("an identity correction never moves scores, the round or the pot, even mid-round", () => {
    const before = withRound();
    const after = apply(before, act("SET_TEAM", { team: "A", color: "red" }));
    expect(after.state.teams.A).toEqual({ name: "Team Red", score: 0, color: "red" });
    expect(after.state.teams.B).toEqual(before.state.teams.B);
    expect(after.state.round).toEqual(before.state.round);
    expect(after.state.phase).toBe(before.state.phase);
    expect(after.state.round!.pot).toBe(12);
  });

  it("an identity correction can be swapped between the teams without a clash, and is undoable", () => {
    let s = run(initialSession(), act("SET_TEAM", { team: "A", color: "red" }), act("SET_TEAM", { team: "B", color: "blue" }));
    s = run(s, act("SET_TEAM", { team: "A", color: "green" }), act("SET_TEAM", { team: "B", color: "red" }));
    expect([s.state.teams.A.color, s.state.teams.B.color]).toEqual(["green", "red"]);
    s = apply(s, { id: "u-col", type: "UNDO" });
    expect(s.state.teams.B.color).toBe("blue");
  });

  it("ignores a colour that is not one of the six", () => {
    const s = apply(initialSession(), act("SET_TEAM", { team: "A", color: "purple" as never }));
    expect(s.state.teams.A).toEqual({ name: "Team A", score: 0 });
  });

  it("an old save without colours still plays, and a colour can be chosen later without touching its scores", () => {
    const old = initialSession();
    old.state.teams = { A: { name: "Foxes", score: 41 }, B: { name: "Owls", score: 13 } };
    const s = apply(old, act("SET_TEAM", { team: "A", color: "black" }));
    expect(s.state.teams).toEqual({ A: { name: "Team Black", score: 41, color: "black" }, B: { name: "Owls", score: 13 } });
    expect(apply(old, act("ADJUST_SCORE", { team: "B", delta: 2 })).state.teams.B.score).toBe(15);
  });

  it("the next game can name both teams in the same step, and rejects a clashing pair", () => {
    const s = withRound();
    const next = apply(s, act("NEW_MATCH", { nextTeams: true, colors: { A: "black", B: "white" } }));
    expect(next.state.teams).toEqual({ A: { name: "Team Black", score: 0, color: "black" }, B: { name: "Team White", score: 0, color: "white" } });
    expect(next.state).toMatchObject({ phase: "lobby", round: null, roundsPlayed: 0 });
    const clash = apply(s, act("NEW_MATCH", { nextTeams: true, colors: { A: "red", B: "red" } }));
    expect(clash.state.teams).toEqual({ A: { name: "Team A", score: 0 }, B: { name: "Team B", score: 0 } });
  });
});

describe("points, not votes", () => {
  // Workbook-style answers: `count` is the points, `votes` the raw frequency. 13 of 32 is 41 points, 4 of 32 is 13.
  const W: ReadyQuestionSnapshot = {
    id: "w01",
    category: "Event pack",
    prompt: "Invented question",
    demo: false,
    answers: [
      { id: "w1", rank: 1, text: "Top", count: 41, votes: 13, aliases: [] },
      { id: "w2", rank: 2, text: "Second", count: 13, votes: 4, aliases: [] },
      { id: "w3", rank: 3, text: "Third", count: 13, votes: 4, aliases: [] },
    ],
  };
  const play = (...more: Action[]) => run(initialSession(), act("START_ROUND", { question: W, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), ...more);

  it("reveals and the round pot add the points; votes never enter the sum", () => {
    const s = play(act("REVEAL", { answerId: "w1" }), act("REVEAL", { answerId: "w2" }));
    expect(s.state.round!.pot).toBe(54);
  });

  it("a cleared board awards the points total once, however often Award is pressed", () => {
    let s = play(act("REVEAL", { answerId: "w1" }), act("REVEAL", { answerId: "w2" }), act("REVEAL", { answerId: "w3" }));
    s = run(s, act("AWARD"), act("AWARD"), act("AWARD"));
    expect(s.state.teams.A.score).toBe(67);
  });

  it("a steal takes the points pot, and a failed steal leaves it with the playing team", () => {
    const strikes = (s: Session) => run(s, act("STRIKE"), act("STRIKE"), act("STRIKE"));
    const ok = run(strikes(play(act("REVEAL", { answerId: "w2" }))), act("REVEAL", { answerId: "w1" }), act("AWARD"));
    expect(ok.state.teams).toMatchObject({ A: { score: 0 }, B: { score: 54 } });
    const fail = run(strikes(play(act("REVEAL", { answerId: "w2" }))), act("STRIKE"), act("AWARD"));
    expect(fail.state.teams).toMatchObject({ A: { score: 13 }, B: { score: 0 } });
  });

  it("equal points compare as a tie in the face-off, so the first buzzer keeps it", () => {
    const s = run(initialSession(), act("START_ROUND", { question: W, team: "A" }), act("SHOW_BOARD"), act("FACEOFF_START"), act("BUZZ", { team: "A" }), act("REVEAL", { answerId: "w2" }), act("REVEAL", { answerId: "w3" }));
    expect(faceOffCall(s.state.round)).toBe("A");
  });
});

describe("a game with no question limit", () => {
  const play = (s: Session, id: string) => run(s, act("START_ROUND", { question: { ...Q, id }, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"), act("NEXT_ROUND"));

  it("keeps offering questions however many are played, until the moderator ends it", () => {
    let s = run(initialSession(0));
    for (const id of ["q01", "q02", "q03", "q04", "q05", "q06"]) s = play(s, id);
    expect(s.state).toMatchObject({ phase: "lobby", roundsPlayed: 6, totalRounds: 0 });
    expect(s.state.teams.A.score).toBe(180);
    s = apply(s, act("END_MATCH"));
    expect(s.state.phase).toBe("match_over");
  });

  it("can be ended right after a round is scored, without another question", () => {
    let s = run(initialSession(0), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a1" }), act("END_ROUND"), act("AWARD"));
    s = apply(s, act("END_MATCH"));
    expect(s.state).toMatchObject({ phase: "match_over", roundsPlayed: 1 });
    expect(s.state.teams.A.score).toBe(30);
  });

  it("the limit can be set or cleared at any time without touching scores or the round", () => {
    const before = run(initialSession(3), act("START_ROUND", { question: Q, team: "A" }), act("SHOW_BOARD"), act("BEGIN_PLAY"), act("REVEAL", { answerId: "a2" }), act("ADJUST_SCORE", { team: "B", delta: 5 }));
    const after = apply(before, act("SET_ROUNDS", { totalRounds: 0 }));
    expect(after.state.totalRounds).toBe(0);
    expect(after.state.round).toEqual(before.state.round);
    expect(after.state.teams).toEqual(before.state.teams);
    expect(apply(after, act("SET_ROUNDS", { totalRounds: -2 })).state.totalRounds).toBe(0); // nonsense is ignored
    expect(apply(after, act("SET_ROUNDS", { totalRounds: 4 })).state.totalRounds).toBe(4);
  });

  it("a game with a limit still ends itself at the limit", () => {
    const s = play(play(run(initialSession(2)), "q01"), "q02");
    expect(s.state.phase).toBe("match_over");
  });
});
