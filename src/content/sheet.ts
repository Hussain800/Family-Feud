import { CANONICAL } from "./canonical";
import type { Pack } from "./types";

/**
 * Turn rows pasted from a spreadsheet into a pack for `validatePack`.
 * One answer per row: question number (1-16, or q01), the answer, how many students said it, and optionally
 * accepted synonyms (tab-separated pastes only, split on ; or |). Tab-separated (copied from Sheets/Excel) or
 * comma-separated (a CSV) both work; in a CSV the answer may itself contain commas.
 */
export type SheetResult =
  | { ok: true; raw: Pack; preview: { id: string; prompt: string; answers: { text: string; count: number }[] }[] }
  | { ok: false; errors: string[] };

const QNUM = /^q?\s*0*(\d{1,2})$/i;
const clean = (s: string) => s.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/\s+/g, " ").trim();

const cells = (line: string): string[] => {
  if (line.includes("\t")) return line.split("\t").map(clean);
  const t = line.split(",");
  return (t.length <= 3 ? t : [t[0], t.slice(1, -1).join(","), t[t.length - 1]]).map(clean);
};

export function parseSheet(text: string, existing: Pack | null, now = new Date().toISOString()): SheetResult {
  const errors: string[] = [];
  const byQ = new Map<string, { text: string; count: number; aliases: string[] }[]>();
  const lines = text.split(/\r?\n/);
  let seenFirst = false;

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const at = `Line ${i + 1}`;
    const [q = "", answer = "", count = "", alias = ""] = cells(line);
    const first = !seenFirst;
    seenFirst = true;
    const m = q.match(QNUM);
    if (first && !m) return; // a header row such as "Question number, Answer, Number of students"
    const n = m ? Number(m[1]) : 0;
    const id = `q${String(n).padStart(2, "0")}`;
    if (!m || n < 1 || n > CANONICAL.length) return void errors.push(`${at}: "${q}" is not a question number from 1 to ${CANONICAL.length}.`);
    if (!answer) return void errors.push(`${at}: the answer is empty.`);
    if (!/^\d+$/.test(count) || Number(count) < 1) return void errors.push(`${at} (${id} "${answer}"): "${count}" is not a whole number of students.`);
    const aliases = alias.split(/[;|]/).map(clean).filter(Boolean);
    byQ.set(id, [...(byQ.get(id) ?? []), { text: answer, count: Number(count), aliases }]);
  });

  if (!byQ.size && !errors.length) errors.push("Nothing to load. Each row needs: question number, answer, number of students.");
  if (errors.length) return { ok: false, errors };

  const base = existing?.purpose === "event" ? existing : null; // never mix real answers into the demo pack
  const mine = [...byQ].map(([id, rows]) => {
    const c = CANONICAL.find((x) => x.id === id)!;
    return {
      id,
      category: c.category,
      prompt: c.prompt,
      status: "ready" as const,
      survey: { source: "events team survey (pasted)", respondents: null, responseMode: "unconfirmed" as const, collectedAt: now, note: "" },
      answers: rows.map((r, k) => ({ id: `${id}-s${k + 1}`, rank: k + 1, text: r.text, count: r.count, aliases: r.aliases })),
      approval: { confirmedBy: "host", confirmedAt: now },
    };
  });
  // Pasting a few questions at a time adds to what is already loaded instead of wiping it.
  const kept = base ? base.questions.filter((q) => q.status === "ready" && !byQ.has(q.id)) : [];
  return {
    ok: true,
    raw: { schemaVersion: 1, packId: base?.packId ?? `event-${now.slice(0, 10)}`, title: base?.title ?? "Event survey results", purpose: "event", questions: [...kept, ...mine] },
    preview: mine.map((q) => ({ id: q.id, prompt: q.prompt, answers: q.answers.map((a) => ({ text: a.text, count: a.count })) })),
  };
}
