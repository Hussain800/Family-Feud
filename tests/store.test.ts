import { beforeEach, describe, expect, it } from "vitest";
import { initialBuzzers, openBuzzers, pair, press, type Buzzers } from "../src/buzzers/buzzers";
import { buzzerHandlers, publishSnapshot, useFeudStore } from "../src/game/store";
import { EMPTY_SNAPSHOT } from "../src/public/types";

// The network-reachable surface. A phone can reach any non-underscore action, and the relay will
// stamp a spoofed call as role "host", so each action must be safe on its own.
const ctx = (over: object = {}) => ({ actorId: "phone-1", role: "controller" as const, connectedPlayerIds: ["phone-1"], ...over });
const actions = () => useFeudStore.getState().actions;
const resultOf = (v: unknown) => v as { __airJamActionAcceptance?: boolean; __airJamActionRejection?: boolean; reason?: string; result?: Record<string, unknown> };

let b: Buzzers;
beforeEach(() => {
  b = openBuzzers(initialBuzzers(() => 0.1234), "arm1", 0); // team A's code is 1234
  buzzerHandlers.pair = (actor, payload) => {
    const r = pair(b, actor, payload, () => "tok-A");
    b = r.buzzers;
    return r.result;
  };
  buzzerHandlers.press = (actor, payload) => {
    const r = press(b, actor, payload, 500);
    b = r.buzzers;
    return r.result;
  };
});

describe("pairBuzzer and buzz", () => {
  it("a real phone pairs with the code and then buzzes with its token", () => {
    const paired = resultOf(actions().pairBuzzer(ctx(), { code: "1234" }));
    expect(paired.__airJamActionAcceptance).toBe(true);
    expect(paired.result).toEqual({ team: "A", token: "tok-A", gen: 1 });
    const r = resultOf(actions().buzz(ctx(), { armId: "arm1", token: "tok-A" }));
    expect(r.result).toEqual({ status: "first", team: "A" });
  });

  it("refuses calls stamped as the host (the spoofable host channel), and an actor id of 'host'", () => {
    for (const c of [ctx({ role: "host", actorId: "host" }), ctx({ actorId: "host" })]) {
      expect(resultOf(actions().pairBuzzer(c, { code: "1234" })).reason).toBe("forbidden");
      expect(resultOf(actions().buzz(c, { armId: "arm1", token: "tok-A" })).reason).toBe("forbidden");
    }
    expect(b.pairs.A.token).toBeNull();
  });

  it("the team comes from the pairing, never from the payload", () => {
    actions().pairBuzzer(ctx(), { code: "1234" });
    const r = resultOf(actions().buzz(ctx({ actorId: "phone-2" }), { armId: "arm1", token: "tok-A", team: "B" } as never));
    expect(r.reason).toBe("not_paired");
    expect(b.arm!.first).toBeNull();
  });

  it("with phone buzzers off (physical mode) every call is refused", () => {
    buzzerHandlers.pair = null;
    buzzerHandlers.press = null;
    expect(resultOf(actions().pairBuzzer(ctx(), { code: "1234" })).reason).toBe("off");
    expect(resultOf(actions().buzz(ctx(), { armId: "arm1", token: "x" })).reason).toBe("off");
  });
});

describe("publishing", () => {
  it("only the host role can replace the public snapshot", () => {
    const next = { ...EMPTY_SNAPSHOT, rev: 5 };
    actions()._publish({ actorId: "phone-1", role: "controller", connectedPlayerIds: [] }, { snapshot: { ...EMPTY_SNAPSHOT, rev: 99 } });
    expect(useFeudStore.getState().snapshot.rev).toBe(EMPTY_SNAPSHOT.rev);
    publishSnapshot(next);
    expect(useFeudStore.getState().snapshot.rev).toBe(5);
  });

  it("the only network actions are the two buzzer calls: nothing can reveal, score, award or reset", () => {
    const names = Object.keys(actions()).filter((n) => !n.startsWith("_"));
    expect(names.sort()).toEqual(["buzz", "pairBuzzer"]);
  });

  it("the replicated state holds the snapshot and nothing else", () => {
    const { actions: _a, ...data } = useFeudStore.getState();
    expect(Object.keys(data)).toEqual(["snapshot"]);
  });
});
