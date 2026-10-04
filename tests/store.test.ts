import { beforeEach, describe, expect, it } from "vitest";
import { hostHandlers, publishSnapshot, useFeudStore } from "../src/game/store";
import { castVote, openPoll, voteStatus, type PollState } from "../src/poll/poll";
import { EMPTY_SNAPSHOT } from "../src/public/types";

// The network-reachable surface. A phone can reach any non-underscore action, and the relay will
// stamp a spoofed call as role "host", so each action must be safe on its own.
const ctx = (over: object = {}) => ({ actorId: "phone-1", role: "controller" as const, connectedPlayerIds: ["phone-1"], ...over });
const actions = () => useFeudStore.getState().actions;

let poll: PollState | null;
beforeEach(() => {
  const r = openPoll(["a", "b"], 0, () => "p1", 60_000);
  poll = r.ok ? r.poll : null;
  hostHandlers.cast = (actor, payload) => {
    const out = castVote(poll, actor, payload, 1000);
    poll = out.poll;
    return out.result;
  };
  hostHandlers.status = (actor, id) => voteStatus(poll, actor, id);
});

const pay = { pollId: "p1", optionId: "p1-o1" };
const resultOf = (v: unknown) => v as { __airJamActionAcceptance?: boolean; __airJamActionRejection?: boolean; reason?: string; result?: unknown };

describe("castVote", () => {
  it("accepts a real controller and returns an acceptance carrying the status", () => {
    const r = resultOf(actions().castVote(ctx(), pay));
    expect(r.__airJamActionAcceptance).toBe(true);
    expect(r.result).toEqual({ status: "accepted", optionId: "p1-o1" });
  });

  it("refuses a call that arrives stamped as the host (spoofed host channel)", () => {
    const r = resultOf(actions().castVote(ctx({ role: "host", actorId: "host" }), pay));
    expect(r.__airJamActionRejection).toBe(true);
    expect(r.reason).toBe("forbidden");
    expect(poll!.ballots).toEqual({});
  });

  it("refuses an actor id of 'host' even if the role claims controller", () => {
    expect(resultOf(actions().castVote(ctx({ actorId: "host" }), pay)).reason).toBe("forbidden");
  });

  it("refuses votes when no moderator page is mounted", () => {
    hostHandlers.cast = null;
    expect(resultOf(actions().castVote(ctx(), pay)).reason).toBe("no_poll");
  });

  it("identity comes from the connection, never from the payload", () => {
    actions().castVote(ctx({ actorId: "phone-1" }), { ...pay, actorId: "phone-2" } as never);
    expect(Object.keys(poll!.ballots)).toEqual(["phone-1"]);
  });
});

describe("pollStatus", () => {
  it("returns only the caller's own vote", () => {
    actions().castVote(ctx(), pay);
    expect(resultOf(actions().pollStatus(ctx(), { pollId: "p1" })).result).toEqual({ voted: true, optionId: "p1-o1" });
    expect(resultOf(actions().pollStatus(ctx({ actorId: "phone-2" }), { pollId: "p1" })).result).toEqual({ voted: false });
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

  it("there is no network action that can reveal, score, award or reset", () => {
    const names = Object.keys(actions()).filter((n) => !n.startsWith("_"));
    expect(names.sort()).toEqual(["castVote", "pollStatus"]);
  });

  it("the replicated state holds the snapshot and nothing else", () => {
    const { actions: _a, ...data } = useFeudStore.getState();
    expect(Object.keys(data)).toEqual(["snapshot"]);
  });
});
