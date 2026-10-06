import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePack } from "../src/content/schema";
import { workbookToPack } from "../src/content/workbook";

const FIX = join(__dirname, "fixtures");
const PRIVATE = join(__dirname, "..", "private");
const open = (file: string) => {
  const b = readFileSync(file);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// The fixtures are invented. They are laid out like the events team's board: a "Board" sheet, respondents and scale in
// B1 and B2, a Q# header row, and Points as ROUND formulas with their cached results.
describe("reading the answers workbook in the browser", () => {
  it("turns the board into an event pack: points scored, votes and notes kept, numbered as the workbook is", async () => {
    const r = await workbookToPack(open(join(FIX, "synthetic-board.xlsx")));
    if (!r.ok) throw new Error(r.errors.join());
    const v = validatePack(r.raw);
    if (!v.ok) throw new Error(v.errors.join());
    expect(v.pack.purpose).toBe("event");
    expect(v.pack.questions.map((q) => q.id)).toEqual(["w01", "w02"]);
    expect(v.pack.questions[0].prompt).toBe("Name an invented thing");
    const [a, b, c] = v.pack.questions[0].answers;
    expect([a.count, b.count, c.count]).toEqual([45, 15, 15]); // points, not the 9, 3, 3 votes
    expect([a.votes, b.votes, c.votes]).toEqual([9, 3, 3]);
    expect(v.pack.questions[1].answers.map((x) => x.count)).toEqual([25, 5]);
  });

  it("decodes the text exactly: entities, quotes, brackets, and an empty note stays empty", async () => {
    const r = await workbookToPack(open(join(FIX, "synthetic-board.xlsx")));
    if (!r.ok) throw new Error(r.errors.join());
    const q = (r.raw as { questions: { answers: { text: string; notes: string }[] }[] }).questions;
    expect(q[0].answers[0].text).toBe("Alpha & Omega");
    expect(q[0].answers[0].notes).toBe('Alpha; alpha & omega; "omega"');
    expect(q[0].answers[2].notes).toBe("");
    expect(q[1].answers[0]).toMatchObject({ text: "Delta (Dawn)", notes: "Delta; dawn <early>" });
  });

  it("refuses a workbook whose Points disagree with its votes, naming the cell, and loads nothing", async () => {
    const r = await workbookToPack(open(join(FIX, "synthetic-board-bad-points.xlsx")));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/F7: the workbook says 22 points but 3 of 20 responses is 15/);
  });

  it("says plainly when the file is not a workbook", async () => {
    const r = await workbookToPack(new TextEncoder().encode("{ not an excel file }").buffer as ArrayBuffer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/does not look like an Excel workbook/);
  });

  // Needs private/family_feud_board.xlsx and private/event-pack.json (both git-ignored); skipped anywhere they are missing.
  const real = existsSync(join(PRIVATE, "family_feud_board.xlsx")) && existsSync(join(PRIVATE, "event-pack.json"));
  it.skipIf(!real)("the real workbook gives exactly the pack the converter script verified against every source cell", async () => {
    const r = await workbookToPack(open(join(PRIVATE, "family_feud_board.xlsx")));
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.raw).toEqual(JSON.parse(readFileSync(join(PRIVATE, "event-pack.json"), "utf8")));
    const v = validatePack(r.raw);
    expect(v.ok && v.pack.questions.length).toBe(14);
    expect(v.ok && v.pack.questions.reduce((n, q) => n + q.answers.length, 0)).toBe(73);
  });
});
