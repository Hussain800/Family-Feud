import { describe, expect, it } from "vitest";
import { MAX_WRONG_CODES, clearArm, closeBuzzers, initialBuzzers, openBuzzers, pair, press, publicBuzzers, resetPairing, type Buzzers } from "../src/buzzers/buzzers";

// A fixed sequence so the codes are known: 0.1234 -> "1234", 0.5678 -> "5678", then 0.9 -> "9000"...
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
let t = 0;
const token = () => `tok${++t}`;
const fresh = () => initialBuzzers(seq(0.1234, 0.5678, 0.9));
const paired = (): Buzzers => {
  let b = fresh();
  b = pair(b, "phone-a", { code: "1234" }, token).buzzers;
  b = pair(b, "phone-b", { code: "5678" }, token).buzzers;
  return b;
};
const tokenOf = (b: Buzzers, team: "A" | "B") => b.pairs[team].token!;

describe("pairing", () => {
  it("gives each team its own code, and a phone that types it gets that team and a token", () => {
    const b = fresh();
    expect(b.pairs.A.code).toBe("1234");
    expect(b.pairs.B.code).toBe("5678");
    const r = pair(b, "phone-b", { code: "5678" }, () => "secret");
    expect(r.result).toEqual({ ok: true, team: "B", token: "secret", gen: 1 });
    expect(r.buzzers.pairs.B).toMatchObject({ actorId: "phone-b", token: "secret" });
  });

  it("a used code cannot pair a second phone, and wrong codes lock pairing after a limit", () => {
    let b = paired();
    expect(pair(b, "rogue", { code: "1234" }, token).result).toEqual({ ok: false, reason: "wrong_code" });
    for (let i = 0; i < MAX_WRONG_CODES; i++) b = pair(b, "rogue", { code: String(1000 + i) }, token).buzzers;
    expect(pair(b, "rogue", { code: "0000" }, token).result).toEqual({ ok: false, reason: "locked" });
    b = resetPairing(b, seq(0.4321, 0.8765));
    expect(b.wrongCodes).toBe(0);
    expect(pair(b, "phone-a", { code: "4321" }, token).result).toMatchObject({ ok: true, team: "A" });
  });

  it("rejects malformed payloads", () => {
    for (const p of [null, {}, { code: 1234 }, { code: "12a4" }, { code: "12345" }]) expect(pair(fresh(), "x", p, token).result).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("presses", () => {
  const armed = () => openBuzzers(paired(), "arm1", 1000);

  it("the first valid press locks the result; the other team's is recorded as second; repeats change nothing", () => {
    let b = armed();
    let r = press(b, "phone-b", { armId: "arm1", token: tokenOf(b, "B") }, 1840);
    expect(r.result).toEqual({ ok: true, status: "first", team: "B" });
    b = r.buzzers;
    expect(b.arm!.first).toEqual({ team: "B", ms: 840 });
    r = press(b, "phone-b", { armId: "arm1", token: tokenOf(b, "B") }, 1900);
    expect(r.result).toEqual({ ok: true, status: "duplicate", team: "B" });
    r = press(b, "phone-a", { armId: "arm1", token: tokenOf(b, "A") }, 2010);
    expect(r.result).toEqual({ ok: true, status: "second", team: "A" });
    expect(r.buzzers.arm).toMatchObject({ first: { team: "B", ms: 840 }, second: { team: "A", ms: 1010 }, open: false });
    expect(press(r.buzzers, "phone-a", { armId: "arm1", token: tokenOf(b, "A") }, 2100).result).toMatchObject({ status: "duplicate" });
  });

  it("an impostor with the paired phone's connection id but no token is refused", () => {
    const b = armed();
    expect(press(b, "phone-a", { armId: "arm1" }, 1500).result).toEqual({ ok: false, reason: "not_paired" });
    expect(press(b, "phone-a", { armId: "arm1", token: "guess" }, 1500).result).toEqual({ ok: false, reason: "not_paired" });
  });

  it("a stolen token from another connection is refused too", () => {
    const b = armed();
    expect(press(b, "rogue", { armId: "arm1", token: tokenOf(b, "A") }, 1500).result).toEqual({ ok: false, reason: "not_paired" });
  });

  it("unpaired phones, closed buzzers and presses for an earlier opening are refused", () => {
    const b = armed();
    expect(press(b, "spectator", { armId: "arm1", token: "x" }, 1500).result).toEqual({ ok: false, reason: "not_paired" });
    const reopened = openBuzzers(b, "arm2", 3000);
    expect(press(reopened, "phone-a", { armId: "arm1", token: tokenOf(b, "A") }, 3100).result).toEqual({ ok: false, reason: "stale" });
    expect(press(closeBuzzers(b), "phone-a", { armId: "arm1", token: tokenOf(b, "A") }, 1500).result).toEqual({ ok: false, reason: "not_open" });
    expect(press(clearArm(b), "phone-a", { armId: "arm1", token: tokenOf(b, "A") }, 1500).result).toEqual({ ok: false, reason: "not_open" });
  });

  it("resetting a pairing (the next teams) kills the old token: the old phone controls nothing", () => {
    const b = armed();
    const next = openBuzzers(resetPairing(b, seq(0.2, 0.3)), "arm9", 5000);
    expect(press(next, "phone-a", { armId: "arm9", token: tokenOf(b, "A") }, 5100).result).toEqual({ ok: false, reason: "not_paired" });
    expect(next.pairs.A.gen).toBe(2);
  });
});

describe("what leaves the console", () => {
  it("the public view says who is paired and when presses arrived, never codes, tokens or connection ids", () => {
    let b = openBuzzers(paired(), "arm1", 1000);
    b = press(b, "phone-a", { armId: "arm1", token: tokenOf(b, "A") }, 1500).buzzers;
    const pub = publicBuzzers(b, (id) => id === "phone-a");
    expect(pub).toEqual({ open: true, armId: "arm1", paired: { A: true, B: true }, gen: { A: 1, B: 1 }, online: { A: true, B: false }, first: { team: "A", ms: 500 }, second: null });
    const json = JSON.stringify(pub);
    for (const secret of ["1234", "5678", "tok", "phone-a", "phone-b"]) expect(json).not.toContain(secret);
  });
});
