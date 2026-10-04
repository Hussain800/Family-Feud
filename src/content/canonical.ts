// The 16 supplied questions come straight from the seed template so the wording cannot drift.
// That template holds no answers, so bundling it publishes nothing private.
import template from "../../data/templates/event_questions.pending.json";
import demo from "../../data/demo/demo_pack.json";
import type { Pack } from "./types";

export const PENDING_PACK = template as unknown as Pack;
// Invented practice results. Public by design and always labelled DEMO.
export const DEMO_PACK_RAW: unknown = demo;

export const CANONICAL = PENDING_PACK.questions.map(({ id, category, prompt }) => ({
  id,
  category,
  prompt,
}));
