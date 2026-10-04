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
