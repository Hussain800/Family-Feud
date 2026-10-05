import { describe, expect, it } from "vitest";
import { DEMO_PACK_RAW } from "../src/content/canonical";
import { isCustomPack, validatePack } from "../src/content/schema";
import { questionLabel } from "../src/content/types";
import { apply, initialSession } from "../src/engine/reducer";
import type { Action, Session } from "../src/engine/types";
import { projectPublic } from "../src/public/project";
import { TEAM_COLORS, TEAM_PRESETS, isTeamColor, teamLabel } from "../src/teams";

// Everything here is invented. The real event pack lives in private/ and is never read by a test that gets committed.
const S = { note: "ZZNOTE-4c1e9 what people wrote", hidden: "ZZHIDDEN-answer-88a", votes: 17 };
const ans = (id: string, rank: number, text: string, count: number, votes: number, notes = "") => ({ id, rank, text, count, votes, aliases: [] as string[], notes });
const question = (id: string, prompt: string, answers: unknown[], respondents = 32) => ({
  id,
  category: "Event pack",
  prompt,
  status: "ready",
  survey: { source: "events_team_workbook", respondents, responseMode: "single", collectedAt: null, note: "" },
  answers,
  approval: null,
});
const pack = (...questions: unknown[]) => ({ schemaVersion: 1, packId: "event-synth", title: "Synthetic event pack", purpose: "event", questions });
const six = [ans("w01a1", 1, "Alpha", 41, 13, S.note), ans("w01a2", 2, "Bravo", 13, 4), ans("w01a3", 3, "Charlie", 13, 4), ans("w01a4", 4, S.hidden, 9, 3), ans("w01a5", 5, "Echo", 6, 2)];

describe("an event pack with its own question set", () => {
  it("is accepted as-is: its own ids, its own wording, only its own questions", () => {
    const r = validatePack(pack(question("w01", "Invented question one", six), question("w02", "Invented question two", [ans("w02a1", 1, "Solo", 31, 10)])));
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.pack.questions.map((q) => q.id)).toEqual(["w01", "w02"]); // nothing filled in from the 16-question template
    expect(isCustomPack(r.pack)).toBe(true);
    expect(r.pack.questions[0].prompt).toBe("Invented question one");
    expect(questionLabel("w06")).toBe("Question 6");
  });

  it("scores the supplied points and keeps votes and notes beside them, never normalised to 100", () => {
    const r = validatePack(pack(question("w01", "Invented question one", six)));
    if (!r.ok) throw new Error(r.errors.join());
    const a = r.pack.questions[0].answers;
    expect(a.map((x) => x.count)).toEqual([41, 13, 13, 9, 6]);
    expect(a.map((x) => x.votes)).toEqual([13, 4, 4, 3, 2]);
    expect(a.reduce((n, x) => n + x.count, 0)).toBe(82); // not 100, not the 26 votes
    expect(a[0].notes).toBe(S.note);
  });

  it("keeps tied points in the order supplied", () => {
    const r = validatePack(pack(question("w01", "Invented question one", six)));
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.pack.questions[0].answers.slice(1, 3).map((x) => x.text)).toEqual(["Bravo", "Charlie"]);
  });

  it("checks respondents against votes, not against percentage-scaled points", () => {
    // 41 points is more than 32 respondents, and fine. 33 votes is more than 32 respondents, and not.
    expect(validatePack(pack(question("w01", "Invented", [ans("a", 1, "Top", 41, 13)]))).ok).toBe(true);
    const r = validatePack(pack(question("w01", "Invented", [ans("a", 1, "Top", 100, 33)])));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/33 votes, more than the 32 respondents/);
    const sum = validatePack(pack(question("w01", "Invented", [ans("a", 1, "One", 50, 20), ans("b", 2, "Two", 40, 15)])));
    expect(sum.ok).toBe(false);
    if (!sum.ok) expect(sum.errors.join()).toMatch(/votes total 35/);
  });

  it("does not mix with the q01-q16 template, and never matches questions by number", () => {
    const legacy = (DEMO_PACK_RAW as { questions: unknown[] }).questions[0];
    const r = validatePack(pack(question("w01", "Invented", six), legacy));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/Do not mix/);
    expect(validatePack(pack(question("q17", "Looks like a template id", six))).ok).toBe(false);
  });

  it("rejects bad votes and notes, and the demo pack still loads and still reads as practice", () => {
    expect(validatePack(pack(question("w01", "Invented", [{ ...ans("a", 1, "Top", 41, 13), votes: 0 }]))).ok).toBe(false);
    expect(validatePack(pack(question("w01", "Invented", [{ ...ans("a", 1, "Top", 41, 13), notes: "x".repeat(1001) }]))).ok).toBe(false);
    const demo = validatePack(DEMO_PACK_RAW);
    expect(demo.ok && demo.pack.purpose).toBe("demo");
    expect(demo.ok && isCustomPack(demo.pack)).toBe(false);
  });
});

describe("public snapshot of an event pack", () => {
  const room = { code: null, joinUrl: null, status: "ready" as const, connected: 0, capacity: 16 };
  const act = (type: string, rest: object = {}) => ({ id: `e${Math.random()}`, type, ...rest }) as Action;
  function playing(): Session {
    const r = validatePack(pack(question("w01", "Invented question one", six)));
    if (!r.ok) throw new Error(r.errors.join());
    const q = r.pack.questions[0];
    return [
      act("SET_TEAM", { team: "A", color: "black" }),
      act("SET_TEAM", { team: "B", color: "white" }),
      act("START_ROUND", { team: "A", question: { id: q.id, category: q.category, prompt: q.prompt, demo: false, answers: q.answers } }),
      act("SHOW_BOARD"),
      act("BEGIN_PLAY"),
      act("REVEAL", { answerId: "w01a2" }),
    ].reduce(apply, initialSession());
  }

  it("carries revealed text and points only: no notes, no votes, no unrevealed answers or their points", () => {
    const snap = projectPublic({ rev: 1, game: playing().state, demo: false, room, preview: null });
    const json = JSON.stringify(snap);
    for (const secret of [S.note, "ZZNOTE", S.hidden, "Alpha", "Charlie", "votes", "notes", "w01a1"]) expect(json, secret).not.toContain(secret);
    expect(snap.round!.slots[1]).toEqual({ index: 2, revealed: true, text: "Bravo", count: 13 }); // points, not the 4 votes
    expect(snap.round!.slots[0]).toEqual({ index: 1, revealed: false });
    expect(snap.pot).toBe(13);
    expect(snap.demoLabel).toBeNull(); // genuine event data carries no demo banner
  });

  it("publishes the teams' colours as public identity, and null for an old save", () => {
    const snap = projectPublic({ rev: 1, game: playing().state, demo: false, room, preview: null });
    expect(snap.teams.map((t) => [t.name, t.color])).toEqual([["Team Black", "black"], ["Team White", "white"]]);
    const old = initialSession();
    old.state.teams = { A: { name: "Foxes", score: 4 }, B: { name: "Owls", score: 2, color: "mauve" as never } };
    expect(projectPublic({ rev: 1, game: old.state, demo: false, room, preview: null }).teams.map((t) => t.color)).toEqual([null, null]);
  });
});

describe("team colour presets", () => {
  it("offers exactly Red, Blue, Yellow, Green, Black and White, each readable and distinct", () => {
    expect(TEAM_COLORS).toEqual(["red", "blue", "yellow", "green", "black", "white"]);
    expect(new Set(TEAM_COLORS.map((c) => TEAM_PRESETS[c].fill)).size).toBe(6);
    expect(TEAM_COLORS.map(teamLabel)).toEqual(["Team Red", "Team Blue", "Team Yellow", "Team Green", "Team Black", "Team White"]);
    expect(isTeamColor("red") && !isTeamColor("purple") && !isTeamColor(null)).toBe(true);
  });

  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  it("text on every colour badge meets 4.5:1, and black and white keep an outline against the surface they would vanish into", () => {
    for (const c of TEAM_COLORS) expect(contrast(TEAM_PRESETS[c].fill, TEAM_PRESETS[c].ink), c).toBeGreaterThanOrEqual(4.5);
    expect(TEAM_PRESETS.black.edgeOnDark).not.toBeNull(); // black on the cobalt projector
    expect(TEAM_PRESETS.white.edgeOnLight).not.toBeNull(); // white on a frost card
    expect(TEAM_PRESETS.blue.edgeOnDark).not.toBeNull(); // blue against cobalt
  });
});
