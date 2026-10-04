import { describe, expect, it } from "vitest";
import { CANONICAL, DEMO_PACK_RAW, PENDING_PACK } from "../src/content/canonical";
import { validatePack } from "../src/content/schema";

// Independent copy of the supplied wording (BUILD_SPEC section 14), curly apostrophes included.
const SUPPLIED = [
  "Name something students do instead of studying.",
  "Name something you’d find in almost every student’s bag.",
  "Name a reason someone might be late to class.",
  "Name something students commonly eat between classes.",
  "Name something students do the night before an exam.",
  "Name something people queue for on campus.",
  "Name something you’d expect to find at a university event.",
  "Name something people complain about during a Dubai summer.",
  "Name a place you’d take a friend who is visiting Dubai.",
  "Name something you would order at 2 a.m.",
  "Name something people buy when they’re hungry at a supermarket.",
  "Name an app that almost every student has on their phone.",
  "Name something people do when they’re bored.",
  "Name something people often forget when leaving the house.",
  "Name something people do as soon as they get home.",
  "Name something people take photos of.",
];

const clone = <T,>(v: T): T => structuredClone(v);
const demo = () => clone(DEMO_PACK_RAW) as { purpose: string };
const answer = (id: string, text: string, count: number, rank = 1, aliases: string[] = []) => ({ id, rank, text, count, aliases });
const eventPack = (q: Record<string, unknown>) => ({
  schemaVersion: 1,
  packId: "event-test",
  title: "Event test",
  purpose: "event",
  questions: [
    {
      id: "q05",
      category: "Student Life",
      prompt: SUPPLIED[4],
      status: "ready",
      survey: { source: "events_team_csv", respondents: 100, responseMode: "single", collectedAt: null, note: "" },
      answers: [answer("x1", "Cram", 40), answer("x2", "Panic", 30, 2)],
      approval: null,
      ...q,
    },
  ],
});
const errorsOf = (raw: unknown) => {
  const r = validatePack(raw);
  return r.ok ? [] : r.errors;
};

describe("canonical content", () => {
  it("keeps all 16 supplied prompts exact, in order", () => {
    expect(CANONICAL.map((q) => q.prompt)).toEqual(SUPPLIED);
    expect(CANONICAL.map((q) => q.id)).toEqual(Array.from({ length: 16 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`));
  });

  it("pending pack validates, previews, and carries no fake answers", () => {
    const r = validatePack(PENDING_PACK);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.questions.every((q) => q.status === "awaiting_survey" && q.answers.length === 0)).toBe(true);
    }
  });
});

describe("demo pack", () => {
  it("validates, stays purpose demo, and keeps counts un-normalised", () => {
    const r = validatePack(DEMO_PACK_RAW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.purpose).toBe("demo");
    const q01 = r.pack.questions.find((q) => q.id === "q01")!;
    expect(q01.answers.map((a) => a.count)).toEqual([23, 16, 11, 7, 4, 2]);
    expect(q01.answers.reduce((n, a) => n + a.count, 0)).not.toBe(100);
    expect(r.pack.questions.filter((q) => q.status === "ready").map((q) => q.id)).toEqual(["q01", "q03", "q10"]);
  });

  it("cannot be relabelled as event data", () => {
    const raw = demo();
    raw.purpose = "event";
    expect(errorsOf(raw).join()).toMatch(/synthetic demo results cannot sit in an event pack/);
  });
});

describe("import validation", () => {
  it("accepts a one-question real pack and leaves the rest pending", () => {
    const r = validatePack(eventPack({}));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pack.questions).toHaveLength(16);
      expect(r.pack.questions.filter((q) => q.status === "ready")).toHaveLength(1);
    }
  });

  it("rejects rewritten questions", () => {
    expect(errorsOf(eventPack({ prompt: "Name something else." })).join()).toMatch(/prompt differs/);
    expect(errorsOf(eventPack({ category: "Food" })).join()).toMatch(/category differs/);
  });

  it("rejects bad counts, empty text, duplicate ids, unknown ids, too many answers", () => {
    expect(errorsOf(eventPack({ answers: [answer("x1", "A", 0)] })).join()).toMatch(/count must be a positive integer/);
    expect(errorsOf(eventPack({ answers: [answer("x1", "A", 1.5)] })).join()).toMatch(/count must be a positive integer/);
    expect(errorsOf(eventPack({ answers: [answer("x1", "  ", 3)] })).join()).toMatch(/text is required/);
    expect(errorsOf(eventPack({ answers: [answer("x1", "A", 3), answer("x1", "B", 2)] })).join()).toMatch(/duplicate answer id/);
    expect(errorsOf(eventPack({ id: "q99" })).join()).toMatch(/unknown question id/);
    const eleven = Array.from({ length: 11 }, (_, i) => answer(`e${i}`, `Item ${i}`, 20 - i, i + 1));
    expect(errorsOf(eventPack({ answers: eleven })).join()).toMatch(/1-10 answers/);
  });

  it("accepts exactly one and exactly ten answers", () => {
    expect(validatePack(eventPack({ answers: [answer("x1", "Only", 5)] })).ok).toBe(true);
    const ten = Array.from({ length: 10 }, (_, i) => answer(`t${i}`, `Item ${i}`, 10 - i, i + 1));
    expect(validatePack(eventPack({ answers: ten })).ok).toBe(true);
  });

  it("sorts by count, keeps supplied order on ties, and renumbers ranks", () => {
    const r = validatePack(eventPack({ answers: [answer("lo", "Low", 5, 1), answer("t1", "Tie one", 9, 2), answer("t2", "Tie two", 9, 3), answer("hi", "High", 12, 4)] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const a = r.pack.questions.find((q) => q.id === "q05")!.answers;
      expect(a.map((x) => x.id)).toEqual(["hi", "t1", "t2", "lo"]);
      expect(a.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    }
  });

  it("flags duplicate normalised labels and conflicting aliases", () => {
    expect(errorsOf(eventPack({ answers: [answer("a", "Coffee!", 9), answer("b", " coffee", 4, 2)] })).join()).toMatch(/duplicates/);
    expect(errorsOf(eventPack({ answers: [answer("a", "Tea", 9, 1, ["Chai"]), answer("b", "Chai", 4, 2)] })).join()).toMatch(/collides/);
  });

  it("checks single-response counts against respondents but never forces 100", () => {
    expect(errorsOf(eventPack({ answers: [answer("a", "A", 60), answer("b", "B", 50, 2)] })).join()).toMatch(/more than the 100/);
    const multi = eventPack({ survey: { source: "events_team_csv", respondents: 100, responseMode: "multiple", collectedAt: null, note: "" }, answers: [answer("a", "A", 60), answer("b", "B", 50, 2)] });
    expect(validatePack(multi).ok).toBe(true);
  });

  it("warns on long labels instead of shrinking them", () => {
    const r = validatePack(eventPack({ answers: [answer("a", "An answer that is much too long to fit one line", 9)] }));
    expect(r.ok && r.warnings.join()).toMatch(/may wrap/);
  });

  it("rejects non-JSON-object input without throwing", () => {
    expect(errorsOf(null)[0]).toMatch(/JSON object/);
    expect(errorsOf("nope")[0]).toMatch(/JSON object/);
    expect(errorsOf({ schemaVersion: 2 }).length).toBeGreaterThan(0);
  });

  it("does not mutate its input", () => {
    const raw = eventPack({ answers: [answer("lo", "Low", 5, 1), answer("hi", "High", 12, 2)] });
    const copy = clone(raw);
    validatePack(raw);
    expect(raw).toEqual(copy);
  });
});
