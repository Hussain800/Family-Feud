import type { TeamId } from "../engine/types";
import type { PublicFaceOff } from "./types";

/** Whose answer the room is waiting for in the face-off: the first buzzer, then the other team. */
export function faceOffTurn(f: PublicFaceOff | null): TeamId | null {
  if (!f?.buzzed || f.winner) return null;
  if (!f.tries[f.buzzed]) return f.buzzed;
  const other: TeamId = f.buzzed === "A" ? "B" : "A";
  return f.tries[other] ? null : other;
}
