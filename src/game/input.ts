/**
 * The SDK requires an input schema. This game never uses the per-frame input lane: a vote is a
 * discrete store action with an explicit host acknowledgement, not a held button.
 */
import { z } from "zod";

export const gameInputSchema = z.object({});
