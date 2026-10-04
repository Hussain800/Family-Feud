import { describe, expect, it } from "vitest";
import { PENDING_PACK } from "../src/content/canonical";
import { validatePack } from "../src/content/schema";
import { parseSheet } from "../src/content/sheet";

// Invented rows, only to pin the parser down.
const TSV = ["Question number\tAnswer\tNumber of students\tAlso accept", "1\tScrolling social media\t23\tdoom scrolling; TikTok", "1\tSleeping\t16", "q02\tLaptop\t30", "2\tWater bottle\t12\tflask"].join("\n");

describe("pasting survey rows from a spreadsheet", () => {
  it("reads tab-separated rows, skips the header, groups by question and keeps synonyms", () => {
    const r = parseSheet(TSV, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview.map((q) => [q.id, q.answers.length])).toEqual([["q01", 2], ["q02", 2]]);
    const v = validatePack(r.raw);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const q1 = v.pack.questions.find((q) => q.id === "q01")!;
    expect(q1.status).toBe("ready");
    expect(q1.answers[0]).toMatchObject({ text: "Scrolling social media", count: 23, rank: 1, aliases: ["doom scrolling", "TikTok"] });
    expect(q1.prompt).toBe(PENDING_PACK.questions[0].prompt); // the fixed wording, never the pasted text
    expect(v.pack.purpose).toBe("event");
    expect(v.pack.questions.find((q) => q.id === "q03")!.status).toBe("awaiting_survey");
  });

  it("reads CSV where the answer contains commas or quotes", () => {
    const r = parseSheet('1,"Hanging out, chilling",9\n1,Sleeping,16\r\n3,"Traffic",20', null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preview[0].answers).toEqual([{ text: "Hanging out, chilling", count: 9 }, { text: "Sleeping", count: 16 }]);
  });

  it("gives line-numbered errors for a bad question number, an empty answer and a count that is not a whole number", () => {
    const r = parseSheet("1\tSleeping\t23%\n17\tNope\t3\n2\t\t4\nQ\tbad\t1", null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join("\n")).toMatch(/Line 1.*"23%".*whole number/);
    expect(r.errors.join("\n")).toMatch(/Line 2.*from 1 to 16/);
    expect(r.errors.join("\n")).toMatch(/Line 3.*empty/);
  });

  it("does not mistake a first data row with a bad count for a header", () => {
    expect(parseSheet("1\tSleeping\tmany", null).ok).toBe(false);
  });

  it("refuses an empty paste", () => {
    expect(parseSheet("  \n\n", null).ok).toBe(false);
    expect(parseSheet("Question number\tAnswer\tCount", null).ok).toBe(false);
  });

  it("adds to an event pack already loaded instead of wiping it, and replaces a question pasted again", () => {
    const first = parseSheet(TSV, null);
    if (!first.ok) throw new Error("first");
    const v1 = validatePack(first.raw);
    if (!v1.ok) throw new Error("v1");
    const second = parseSheet("3\tTraffic\t26\n2\tCharger\t40", v1.pack);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const v2 = validatePack(second.raw);
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const byId = Object.fromEntries(v2.pack.questions.map((q) => [q.id, q]));
    expect(byId.q01.status).toBe("ready"); // kept
    expect(byId.q03.answers[0].text).toBe("Traffic"); // added
    expect(byId.q02.answers.map((a) => a.text)).toEqual(["Charger"]); // replaced, not merged
  });

  it("never mixes real rows into the demo pack", () => {
    const demo = { ...PENDING_PACK, purpose: "demo" as const };
    const r = parseSheet("1\tSleeping\t5", demo);
    expect(r.ok && r.raw.purpose).toBe("event");
  });

  it("leaves the checks to the pack validator: duplicates and more than ten answers are rejected", () => {
    const dup = parseSheet("1\tSleeping\t5\n1\tsleeping\t4", null);
    if (!dup.ok) throw new Error("dup");
    expect(validatePack(dup.raw).ok).toBe(false);
    const eleven = parseSheet(Array.from({ length: 11 }, (_, i) => `1\tAnswer ${i}\t${20 - i}`).join("\n"), null);
    if (!eleven.ok) throw new Error("eleven");
    const v = validatePack(eleven.raw);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.join()).toMatch(/1-10 answers/);
  });
});
