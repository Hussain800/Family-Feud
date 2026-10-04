import { CANONICAL, PENDING_PACK } from "./canonical";
import {
  MAX_ANSWERS,
  type Answer,
  type Pack,
  type Question,
  type ResponseMode,
  type Survey,
} from "./types";

export type ValidationResult =
  | { ok: true; pack: Pack; warnings: string[] }
  | { ok: false; errors: string[] };

const RESPONSE_MODES: ResponseMode[] = ["single", "multiple", "unconfirmed"];
const LONG_LABEL = 30; // wider than the 1080p tile fits on one line; flagged, never shrunk
const MAX_LABEL = 80;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const normaliseLabel = (s: string): string =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");

const defaultSurvey = (): Survey => ({
  source: "events_team_pending",
  respondents: null,
  responseMode: "unconfirmed",
  collectedAt: null,
  note: "",
});

/** Validate an imported or edited pack. Never mutates the input; never throws. */
export function validatePack(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["Pack must be a JSON object."] };

  if (raw.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  const packId = typeof raw.packId === "string" ? raw.packId.trim() : "";
  if (!packId || packId.length > 64) errors.push("packId must be 1-64 characters.");
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) errors.push("title is required.");
  if (raw.purpose !== "event" && raw.purpose !== "demo") errors.push('purpose must be "event" or "demo".');
  if (!Array.isArray(raw.questions)) {
    errors.push("questions must be an array.");
    return { ok: false, errors };
  }
  const purpose = raw.purpose === "demo" ? "demo" : "event";

  const byId = new Map<string, Question>();
  const answerIds = new Set<string>();

  raw.questions.forEach((rq, qi) => {
    const where = `questions[${qi}]`;
    if (!isObj(rq)) return void errors.push(`${where} must be an object.`);
    const id = typeof rq.id === "string" ? rq.id : "";
    const canon = CANONICAL.find((c) => c.id === id);
    if (!canon) return void errors.push(`${where}: unknown question id "${id}". Only q01-q16 are allowed.`);
    if (byId.has(id)) return void errors.push(`${id}: appears more than once.`);
    // Questions are fixed. Editing answers must never rewrite them.
    if (rq.prompt !== canon.prompt) errors.push(`${id}: prompt differs from the supplied question text.`);
    if (rq.category !== canon.category) errors.push(`${id}: category differs from "${canon.category}".`);
    if (rq.status !== "awaiting_survey" && rq.status !== "ready") {
      return void errors.push(`${id}: status must be "awaiting_survey" or "ready".`);
    }
    const status = rq.status;

    let survey = defaultSurvey();
    if (rq.survey !== undefined) {
      const s = rq.survey;
      if (!isObj(s)) errors.push(`${id}: survey must be an object.`);
      else {
        const respondents = s.respondents ?? null;
        if (respondents !== null && !(Number.isInteger(respondents) && (respondents as number) > 0)) {
          errors.push(`${id}: survey.respondents must be a positive integer or null.`);
        }
        if (!RESPONSE_MODES.includes(s.responseMode as ResponseMode)) {
          errors.push(`${id}: survey.responseMode must be single, multiple or unconfirmed.`);
        }
        survey = {
          source: typeof s.source === "string" ? s.source : "",
          respondents: respondents as number | null,
          responseMode: s.responseMode as ResponseMode,
          collectedAt: typeof s.collectedAt === "string" ? s.collectedAt : null,
          note: typeof s.note === "string" ? s.note : "",
        };
      }
    } else if (status === "ready") errors.push(`${id}: ready question needs a survey block.`);

    const rawAnswers = rq.answers ?? [];
    if (!Array.isArray(rawAnswers)) {
      errors.push(`${id}: answers must be an array.`);
      return;
    }
    let answers: Answer[] = [];
    rawAnswers.forEach((ra, ai) => {
      const aw = `${id}.answers[${ai}]`;
      if (!isObj(ra)) return void errors.push(`${aw} must be an object.`);
      const aid = typeof ra.id === "string" ? ra.id.trim() : "";
      const text = typeof ra.text === "string" ? ra.text.trim() : "";
      const count = ra.count;
      const aliases = Array.isArray(ra.aliases) ? ra.aliases : [];
      if (!aid) errors.push(`${aw}: id is required.`);
      else if (answerIds.has(aid)) errors.push(`${aw}: duplicate answer id "${aid}".`);
      else answerIds.add(aid);
      if (!text) errors.push(`${aw}: text is required.`);
      else if (text.length > MAX_LABEL) errors.push(`${aw}: text is longer than ${MAX_LABEL} characters.`);
      else if (CONTROL.test(text)) errors.push(`${aw}: text contains control characters.`);
      if (!(Number.isInteger(count) && (count as number) > 0)) errors.push(`${aw}: count must be a positive integer.`);
      if (aliases.some((a) => typeof a !== "string" || !a.trim() || CONTROL.test(a))) {
        errors.push(`${aw}: aliases must be non-empty strings.`);
      }
      answers.push({
        id: aid,
        rank: Number.isInteger(ra.rank) ? (ra.rank as number) : ai + 1,
        text,
        count: count as number,
        aliases: aliases.filter((a): a is string => typeof a === "string").map((a) => a.trim()),
      });
    });

    if (status === "ready") {
      if (answers.length < 1 || answers.length > MAX_ANSWERS) {
        errors.push(`${id}: ready question needs 1-${MAX_ANSWERS} answers (has ${answers.length}).`);
      }
      if (survey.source === "" ) errors.push(`${id}: survey.source is required.`);
      if (purpose === "event" && survey.source === "synthetic_demo") {
        errors.push(`${id}: synthetic demo results cannot sit in an event pack.`);
      }
      if (purpose === "event" && survey.source === "events_team_pending") {
        errors.push(`${id}: source "events_team_pending" means no results yet. Record where the results came from.`);
      }
      // Order by supplied counts, keep the events team's order for ties, then number ranks 1..n.
      const before = answers.map((a) => a.id).join();
      answers = answers
        .map((a, i) => ({ a, i }))
        .sort((x, y) => y.a.count - x.a.count || x.a.rank - y.a.rank || x.i - y.i)
        .map(({ a }, i) => ({ ...a, rank: i + 1 }));
      if (before !== answers.map((a) => a.id).join()) warnings.push(`${id}: answers re-sorted by count.`);

      const labels = new Map<string, string>();
      for (const a of answers) {
        const key = normaliseLabel(a.text);
        if (labels.has(key)) errors.push(`${id}: "${a.text}" duplicates "${labels.get(key)}". Merge or rename.`);
        else labels.set(key, a.text);
        if (a.text.length > LONG_LABEL) warnings.push(`${id}: "${a.text}" is long and may wrap to two lines.`);
      }
      for (const a of answers) {
        for (const alias of a.aliases) {
          const owner = labels.get(normaliseLabel(alias));
          if (owner && owner !== a.text) errors.push(`${id}: alias "${alias}" on "${a.text}" collides with "${owner}".`);
        }
      }
      const sum = answers.reduce((n, a) => n + a.count, 0);
      if (survey.responseMode === "single" && survey.respondents !== null && sum > survey.respondents) {
        errors.push(`${id}: counts total ${sum}, more than the ${survey.respondents} single-response respondents.`);
      }
    }

    byId.set(id, {
      id,
      category: canon.category,
      prompt: canon.prompt,
      status,
      survey,
      answers,
      approval: isObj(rq.approval)
        ? { confirmedBy: String(rq.approval.confirmedBy ?? ""), confirmedAt: String(rq.approval.confirmedAt ?? "") }
        : null,
    });
  });

  if (errors.length) return { ok: false, errors };

  // Missing questions stay pending so one real result is enough to play.
  const questions = PENDING_PACK.questions.map((p) => {
    const got = byId.get(p.id);
    if (!got) warnings.push(`${p.id}: not in this pack, left awaiting_survey.`);
    return got ?? structuredClone(p);
  });
  return { ok: true, pack: { schemaVersion: 1, packId, title, purpose, questions }, warnings };
}

export const isDemoPack = (pack: Pack): boolean => pack.purpose === "demo";
export const readyQuestions = (pack: Pack): Question[] => pack.questions.filter((q) => q.status === "ready");
export const longLabels = (q: Question): string[] => q.answers.filter((a) => a.text.length > LONG_LABEL).map((a) => a.text);
