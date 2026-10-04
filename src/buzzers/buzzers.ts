/**
 * Optional phone buzzers, one per team. Pure rules: no React, no network, no clock of its own.
 *
 * Why a pairing code and a token, not just the phone's connection id: the Air Jam relay tells every phone in a
 * room the controller id AND device id of every other phone (server:controllerJoined), and a join that presents
 * both takes the slot over. So the relay's identity can be copied. The moderator console shows each team a short
 * code; the phone holder types it in; the console answers that one call with a random token, and only presses that
 * carry the team's token (from the same connection id) count. A copied identity gets the slot, never the token.
 *
 * Timing honesty: a press is timed when it reaches the moderator laptop, counted from when the buzzers opened.
 * That includes network delay, so it is arrival order, not proof of who physically pressed first.
 */
import type { TeamId } from "../engine/types";
import type { PublicBuzzers } from "../public/types";

export const TEAMS: TeamId[] = ["A", "B"];
/** Wrong codes allowed in total before pairing locks until the moderator makes new codes. */
export const MAX_WRONG_CODES = 10;

export interface Pairing {
  code: string;
  actorId: string | null;
  token: string | null;
  /** Bumps whenever this team's pairing is reset, so a phone can tell its pairing has gone. */
  gen: number;
}
export interface Press {
  team: TeamId;
  ms: number;
}
export interface Arm {
  armId: string;
  armedAt: number;
  open: boolean;
  first: Press | null;
  second: Press | null;
}
export interface Buzzers {
  pairs: Record<TeamId, Pairing>;
  wrongCodes: number;
  arm: Arm | null;
}

export type PairResult = { ok: true; team: TeamId; token: string; gen: number } | { ok: false; reason: "invalid" | "wrong_code" | "locked" };
export type PressResult = { ok: true; status: "first" | "second" | "duplicate"; team: TeamId } | { ok: false; reason: "invalid" | "not_paired" | "not_open" | "stale" };

const ID = /^[\w-]{1,64}$/;
const CODE = /^\d{4}$/;

/** A four-digit code, different from the other team's. */
export function newCode(rand: () => number, avoid?: string): string {
  const n = Math.floor(rand() * 10000) % 10000;
  const c = String(n).padStart(4, "0");
  return c === avoid ? String((n + 1) % 10000).padStart(4, "0") : c;
}

export function initialBuzzers(rand: () => number): Buzzers {
  const a = newCode(rand);
  return { pairs: { A: { code: a, actorId: null, token: null, gen: 1 }, B: { code: newCode(rand, a), actorId: null, token: null, gen: 1 } }, wrongCodes: 0, arm: null };
}

/** Forget one team's phone (or both): new codes, old tokens dead, any open press window closed. */
export function resetPairing(b: Buzzers, rand: () => number, teams: TeamId[] = TEAMS): Buzzers {
  const pairs = { ...b.pairs };
  for (const t of teams) {
    const other = pairs[t === "A" ? "B" : "A"].code;
    pairs[t] = { code: newCode(rand, other), actorId: null, token: null, gen: pairs[t].gen + 1 };
  }
  return { pairs, wrongCodes: 0, arm: null };
}

/** A phone types its team's code. The token goes back to that one call only. */
export function pair(b: Buzzers, actorId: string, payload: unknown, newToken: () => string): { buzzers: Buzzers; result: PairResult } {
  const code = (payload as { code?: unknown } | null)?.code;
  if (!actorId || typeof code !== "string" || !CODE.test(code)) return { buzzers: b, result: { ok: false, reason: "invalid" } };
  if (b.wrongCodes >= MAX_WRONG_CODES) return { buzzers: b, result: { ok: false, reason: "locked" } };
  const team = TEAMS.find((t) => !b.pairs[t].token && b.pairs[t].code === code);
  if (!team) {
    const wrongCodes = b.wrongCodes + 1;
    return { buzzers: { ...b, wrongCodes }, result: { ok: false, reason: wrongCodes >= MAX_WRONG_CODES ? "locked" : "wrong_code" } };
  }
  const token = newToken();
  const p = b.pairs[team];
  return { buzzers: { ...b, pairs: { ...b.pairs, [team]: { ...p, actorId, token } } }, result: { ok: true, team, token, gen: p.gen } };
}

/** Which team a press belongs to: the token and the connection must both match a pairing. */
export function teamOf(b: Buzzers, actorId: string, token: unknown): TeamId | null {
  if (typeof token !== "string" || !token) return null;
  return TEAMS.find((t) => b.pairs[t].token === token && b.pairs[t].actorId === actorId) ?? null;
}

export const openBuzzers = (b: Buzzers, armId: string, now: number): Buzzers => ({ ...b, arm: { armId, armedAt: now, open: true, first: null, second: null } });
export const closeBuzzers = (b: Buzzers): Buzzers => (b.arm ? { ...b, arm: { ...b.arm, open: false } } : b);
/** Any change of round or phase, or a switch to physical buzzers: presses for the old opening are void. */
export const clearArm = (b: Buzzers): Buzzers => (b.arm ? { ...b, arm: null } : b);

/** One press. The first valid one locks the result; the other team's is recorded for honest timing; repeats change nothing. */
export function press(b: Buzzers, actorId: string, payload: unknown, now: number): { buzzers: Buzzers; result: PressResult } {
  const { armId, token } = (payload ?? {}) as { armId?: unknown; token?: unknown };
  if (!actorId || typeof armId !== "string" || !ID.test(armId)) return { buzzers: b, result: { ok: false, reason: "invalid" } };
  const team = teamOf(b, actorId, token);
  if (!team) return { buzzers: b, result: { ok: false, reason: "not_paired" } };
  const arm = b.arm;
  if (!arm) return { buzzers: b, result: { ok: false, reason: "not_open" } };
  if (arm.armId !== armId) return { buzzers: b, result: { ok: false, reason: "stale" } };
  if (arm.first?.team === team || arm.second?.team === team) return { buzzers: b, result: { ok: true, status: "duplicate", team } };
  if (!arm.open) return { buzzers: b, result: { ok: false, reason: "not_open" } };
  const at: Press = { team, ms: Math.max(0, now - arm.armedAt) };
  if (!arm.first) return { buzzers: { ...b, arm: { ...arm, first: at } }, result: { ok: true, status: "first", team } };
  return { buzzers: { ...b, arm: { ...arm, second: at, open: false } }, result: { ok: true, status: "second", team } };
}

/** What phones and the projector may know: whether each team has a phone, never the codes, tokens or ids. */
export function publicBuzzers(b: Buzzers, connected: (actorId: string) => boolean): PublicBuzzers {
  const paired = { A: !!b.pairs.A.token, B: !!b.pairs.B.token };
  return {
    open: !!b.arm?.open,
    armId: b.arm?.armId ?? null,
    paired,
    gen: { A: b.pairs.A.gen, B: b.pairs.B.gen },
    online: { A: paired.A && connected(b.pairs.A.actorId!), B: paired.B && connected(b.pairs.B.actorId!) },
    first: b.arm?.first ?? null,
    second: b.arm?.second ?? null,
  };
}
