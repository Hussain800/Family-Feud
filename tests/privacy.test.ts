import { describe, expect, it } from "vitest";
import { validatePack } from "../src/content/schema";
import { apply, initialSession } from "../src/engine/reducer";
import type { Action, Session } from "../src/engine/types";
import { openPoll } from "../src/poll/poll";
import { projectPublic } from "../src/public/project";

// A freshly planted private pack. None of these strings exist anywhere in the repo's public data.
const S = { text: "ZZSENTINEL-TEXT-93f1c", alias: "ZZSENTINEL-ALIAS-7a2e", note: "ZZSENTINEL-NOTE-11bd", count: 7_771_913 };
const priv = {
  schemaVersion: 1,
  packId: "private-test",
  title: "Private test pack",
  purpose: "event",
  questions: [
    {
      id: "q02",
      category: "Student Life",
      prompt: "Name something you’d find in almost every student’s bag.",
      status: "ready",
      survey: { source: "events_team_csv", respondents: null, responseMode: "unconfirmed", collectedAt: null, note: S.note },
      answers: [
        { id: "p-open", rank: 1, text: "Laptop", count: 9_000_001, aliases: [] },
        { id: "p-hidden", rank: 2, text: S.text, count: S.count, aliases: [S.alias] },
        { id: "p-hidden2", rank: 3, text: "Water bottle", count: 9, aliases: ["flask"] },
      ],
      approval: null,
    },
  ],
};

let n = 0;
const act = (type: string, rest: object = {}) => ({ id: `c${++n}`, type, ...rest }) as Action;

function playingSession(): Session {
  const v = validatePack(priv);
  if (!v.ok) throw new Error(v.errors.join());
  const q = v.pack.questions.find((x) => x.id === "q02")!;
  return [
    act("START_ROUND", { team: "A", question: { id: q.id, category: q.category, prompt: q.prompt, demo: false, answers: q.answers } }),
    act("SHOW_BOARD"),
    act("BEGIN_PLAY"),
    act("REVEAL", { answerId: "p-open" }),
  ].reduce(apply, initialSession());
}

const room = { code: "ABCD", joinUrl: "http://192.168.1.2:5173/controller?room=ABCD", status: "ready" as const, connected: 2, capacity: 16 };

describe("public snapshot privacy", () => {
  it("never contains unrevealed answer text, aliases, counts or survey notes", () => {
    const s = playingSession();
    const poll = openPoll(["Pizza", "Burgers"], 0, () => "p1")!;
    const snap = projectPublic({ rev: 1, game: s.state, demo: false, room, poll: poll.ok ? poll.poll : null, now: 10, preview: null });
    const json = JSON.stringify(snap);
    for (const secret of [S.text, S.alias, S.note, String(S.count), "flask", "Water bottle", "p-hidden"]) {
      expect(json, `leaked ${secret}`).not.toContain(secret);
    }
    // the one revealed answer is public, with its count
    expect(json).toContain("Laptop");
    expect(snap.round!.slots[0]).toEqual({ index: 1, revealed: true, text: "Laptop", count: 9_000_001 });
    expect(snap.round!.slots[1]).toEqual({ index: 2, revealed: false });
    expect(snap.pot).toBe(9_000_001); // pot only counts what was revealed
  });

  it("concealed slots carry no point value", () => {
    const snap = projectPublic({ rev: 1, game: playingSession().state, demo: false, room, poll: null, now: 0, preview: null });
    for (const slot of snap.round!.slots.filter((x) => !x.revealed)) expect(Object.keys(slot).sort()).toEqual(["index", "revealed"]);
  });

  it("reveals a secret only after the host reveals it", () => {
    const s = apply(playingSession(), act("REVEAL", { answerId: "p-hidden" }));
    const json = JSON.stringify(projectPublic({ rev: 2, game: s.state, demo: false, room, poll: null, now: 0, preview: null }));
    expect(json).toContain(S.text);
    expect(json).not.toContain(S.alias);
    expect(json).not.toContain(S.note);
  });

  it("template preview shows six empty lines and no scores", () => {
    const snap = projectPublic({ rev: 1, game: initialSession().state, demo: false, room, poll: null, now: 0, preview: { category: "Food", prompt: "Name something you would order at 2 a.m." } });
    expect(snap.phase).toBe("preview");
    expect(snap.round!.slots).toHaveLength(6);
    expect(snap.round!.slots.every((x) => !x.revealed)).toBe(true);
    expect(snap.pot).toBe(0);
  });

  it("carries the demo label whenever the demo pack is active", () => {
    const snap = projectPublic({ rev: 1, game: initialSession().state, demo: true, room, poll: null, now: 0, preview: null });
    expect(snap.demoLabel).toBe("DEMO: INVENTED RESULTS");
  });

  it("the face-off publishes only who buzzed and hit/miss, never counts or hidden answers", () => {
    let st = playingSession();
    // rewind to a face-off on the same private pack
    const v = validatePack(priv);
    if (!v.ok) throw new Error("pack");
    const q = v.pack.questions.find((x) => x.id === "q02")!;
    st = [
      act("START_ROUND", { team: "A", question: { id: q.id, category: q.category, prompt: q.prompt, demo: false, answers: q.answers } }),
      act("SHOW_BOARD"),
      act("FACEOFF_START"),
      act("BUZZ", { team: "B" }),
      act("REVEAL", { answerId: "p-hidden" }),
    ].reduce(apply, initialSession());
    const snap = projectPublic({ rev: 1, game: st.state, demo: false, room, poll: null, now: 0, preview: null });
    expect(snap.phase).toBe("face_off");
    expect(snap.faceOff).toEqual({ buzzed: "B", tries: { A: null, B: "hit" }, winner: null, choice: null });
    expect(JSON.stringify(snap.faceOff)).not.toMatch(/count|ZZSENTINEL|7771913/);
    // the answer that was revealed is public as a slot; the aliases and the other answers still are not
    const json = JSON.stringify(snap);
    expect(json).toContain(S.text);
    expect(json).not.toContain(S.alias);
    expect(json).not.toContain("Water bottle");
  });

  it("marks the tie-break and carries the host's timer, and drops the timer from a template preview", () => {
    const timer = { endsAt: 123456, durationMs: 10000 };
    const g = { ...initialSession().state, roundsPlayed: 3, totalRounds: 4, tieBreakFrom: 3 };
    const snap = projectPublic({ rev: 1, game: g, demo: false, room, poll: null, timer, now: 0, preview: null });
    expect(snap.progress.tieBreak).toBe(true);
    expect(snap.timer).toEqual(timer);
    expect(projectPublic({ rev: 1, game: { ...g, tieBreakFrom: null }, demo: false, room, poll: null, now: 0, preview: null }).progress.tieBreak).toBe(false);
    expect(projectPublic({ rev: 1, game: g, demo: false, room, poll: null, timer, now: 0, preview: { category: "Food", prompt: "x" } }).timer).toBeNull();
  });
});
