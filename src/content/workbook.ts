// Reads the events team's answer workbook (.xlsx) straight into an event pack, in the browser: nothing is uploaded and no
// spreadsheet library is added. An .xlsx is a zip of XML; the browser's own DecompressionStream inflates it.
// Same rules as scripts/workbook_to_pack.py: Points (column F) is what the game scores, Votes (E) and column G are kept
// beside it, and nothing is normalised, merged with the old template or invented.

export type WorkbookResult = { ok: true; raw: unknown } | { ok: false; errors: string[] };

const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);

// ---------- zip ----------
interface ZipEntry { method: number; csize: number; local: number }

function zipEntries(buf: ArrayBuffer): Map<string, ZipEntry> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("damaged zip directory");
    const nameLen = v.getUint16(p + 28, true);
    out.set(decode(new Uint8Array(buf, p + 46, nameLen)), { method: v.getUint16(p + 10, true), csize: v.getUint32(p + 20, true), local: v.getUint32(p + 42, true) });
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return out;
}

async function zipRead(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const v = new DataView(buf);
  const start = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
  const data = new Uint8Array(buf, start, e.csize);
  if (e.method === 0) return decode(data);
  if (e.method !== 8) throw new Error("unsupported zip compression");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return decode(new Uint8Array(await new Response(stream).arrayBuffer()));
}

// ---------- xml (the few tags a worksheet uses) ----------
const unesc = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join("");

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, "")));
}

type Cell = string | number | boolean;
const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function sheetCells(xml: string, shared: string[]): Map<number, Map<number, Cell>> {
  const rows = new Map<number, Map<number, Cell>>();
  for (const m of xml.matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    if (m[1] !== undefined) continue; // an empty cell
    const ref = attr(m[2], "r");
    if (!ref) continue;
    const t = attr(m[2], "t");
    const raw = /<v>([\s\S]*?)<\/v>/.exec(m[3])?.[1];
    let val: Cell | undefined;
    if (t === "inlineStr") val = texts(m[3]);
    else if (raw === undefined) continue;
    else if (t === "s") val = shared[Number(raw)];
    else if (t === "str" || t === "e") val = unesc(raw);
    else if (t === "b") val = raw === "1";
    else val = Number(raw);
    if (val === undefined) continue;
    const r = Number(ref.replace(/\D/g, ""));
    if (!rows.has(r)) rows.set(r, new Map());
    rows.get(r)!.set(colIndex(ref), val);
  }
  return rows;
}

// ---------- the board ----------
/** Excel's ROUND(votes / respondents * scale, 0): halves go up (12.5 becomes 13), not to even. */
const halfUp = (votes: number, respondents: number, scale: number) => Math.floor((votes * scale * 2 + respondents) / (2 * respondents));

/** Workbook bytes in, event pack out. Never throws: every problem comes back as a plain message and nothing is loaded. */
export async function workbookToPack(buf: ArrayBuffer): Promise<WorkbookResult> {
  try {
    const zip = zipEntries(buf);
    const read = async (name: string) => {
      const e = zip.get(name);
      return e ? zipRead(buf, e) : "";
    };
    const wb = await read("xl/workbook.xml");
    const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: unesc(attr(m[0], "name") ?? ""), rid: attr(m[0], "r:id") ?? "" }));
    const pick = sheets.find((s) => /^board$/i.test(s.name)) ?? sheets[0];
    if (!pick) return { ok: false, errors: ["This file has no sheets."] };
    const rels = new Map([...(await read("xl/_rels/workbook.xml.rels")).matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
    const target = rels.get(pick.rid) ?? "worksheets/sheet1.xml";
    const sheetXml = await read(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    if (!sheetXml) return { ok: false, errors: [`Could not read the sheet "${pick.name}".`] };
    const rows = sheetCells(sheetXml, sharedStrings(await read("xl/sharedStrings.xml")));
    return boardToPack(rows);
  } catch (e) {
    return { ok: false, errors: [`This does not look like an Excel workbook (${e instanceof Error ? e.message : "unreadable"}). Choose family_feud_board.xlsx.`] };
  }
}

function boardToPack(rows: Map<number, Map<number, Cell>>): WorkbookResult {
  const errors: string[] = [];
  const cell = (r: number, c: number) => rows.get(r)?.get(c);
  const labelled = (re: RegExp) => {
    for (const [r, cols] of rows) {
      if (r > 4) break;
      const a = cols.get(1);
      if (typeof a === "string" && re.test(a) && typeof cols.get(2) === "number") return cols.get(2) as number;
    }
    return undefined;
  };
  const respondents = labelled(/total survey responses/i);
  const scale = labelled(/points scale/i) ?? 100;
  if (!respondents || !Number.isInteger(respondents) || respondents < 1) errors.push("Could not find the total number of survey responses (the cell beside “Total survey responses”).");

  const headerRow = [...rows].find(([, cols]) => typeof cols.get(1) === "string" && /^q#$/i.test((cols.get(1) as string).trim()))?.[0];
  if (headerRow === undefined) return { ok: false, errors: [...errors, "Could not find the header row (it starts with “Q#”). Is this the answers workbook?"] };
  const col = (re: RegExp) => [...rows.get(headerRow)!].find(([, v]) => typeof v === "string" && re.test(v.trim()))?.[0];
  const C = { q: 1, prompt: col(/^question$/i), rank: col(/^rank$/i), answer: col(/^answer$/i), votes: col(/^votes$/i), points: col(/^points$/i), notes: col(/^counts as/i) };
  for (const [k, v] of Object.entries(C)) if (v === undefined && k !== "notes") errors.push(`The header row has no “${k === "prompt" ? "Question" : k[0].toUpperCase() + k.slice(1)}” column.`);
  if (errors.length || !respondents) return { ok: false, errors };

  type Row = { r: number; rank: number; text: string; votes: number; points: number; notes: string };
  const byQ = new Map<number, { prompt: string; rows: Row[] }>();
  const last = Math.max(...rows.keys());
  for (let r = headerRow + 1; r <= last; r++) {
    const q = cell(r, C.q);
    if (typeof q !== "number") continue;
    const prompt = cell(r, C.prompt!);
    const rank = cell(r, C.rank!);
    const text = cell(r, C.answer!);
    const votes = cell(r, C.votes!);
    const cached = cell(r, C.points!);
    if (typeof prompt !== "string" || !prompt.trim()) { errors.push(`Row ${r}: the question is empty.`); continue; }
    if (typeof text !== "string" || !text.trim()) { errors.push(`Row ${r}: the answer is empty.`); continue; }
    if (typeof rank !== "number" || !Number.isInteger(votes) || (votes as number) < 1) { errors.push(`Row ${r}: the rank or the votes are not whole numbers.`); continue; }
    const computed = halfUp(votes as number, respondents, scale);
    if (typeof cached === "number" && cached !== computed) errors.push(`F${r}: the workbook says ${cached} points but ${votes} of ${respondents} responses is ${computed}.`);
    const note = C.notes === undefined ? undefined : cell(r, C.notes);
    const entry = byQ.get(q) ?? { prompt: prompt.trim(), rows: [] };
    if (entry.prompt !== prompt.trim()) errors.push(`Row ${r}: the question wording differs from the other rows of question ${q}.`);
    entry.rows.push({ r, rank, text: text.trim(), votes: votes as number, points: typeof cached === "number" ? cached : computed, notes: typeof note === "string" ? note : "" });
    byQ.set(q, entry);
  }
  if (!byQ.size) errors.push("No answer rows found under the header.");
  for (const [q, e] of byQ) {
    const ranks = e.rows.map((x) => x.rank);
    if (ranks.some((rk, i) => rk !== i + 1)) errors.push(`Question ${q}: the ranks are not 1, 2, 3 … in order.`);
    if (e.rows.some((x, i) => i > 0 && e.rows[i - 1].points < x.points)) errors.push(`Question ${q}: the points are not in descending order.`);
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    raw: {
      schemaVersion: 1,
      packId: "hello-world-2026-event",
      title: "hello, world! Family Feud: event pack",
      purpose: "event",
      questions: [...byQ].sort(([a], [b]) => a - b).map(([q, e]) => {
        const id = `w${String(q).padStart(2, "0")}`;
        return {
          id,
          category: "Event pack",
          prompt: e.prompt,
          status: "ready",
          survey: { source: "events_team_workbook", respondents, responseMode: "single", collectedAt: null, note: `Workbook question ${q}. Points = round(votes / ${respondents} x ${scale}); retained answers need not total ${scale}.` },
          answers: e.rows.map((x) => ({ id: `${id}a${x.rank}`, rank: x.rank, text: x.text, count: x.points, votes: x.votes, aliases: [], notes: x.notes })),
          approval: null,
        };
      }),
    },
  };
}
