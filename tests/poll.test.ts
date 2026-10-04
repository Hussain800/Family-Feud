import { describe, expect, it } from "vitest";
import { castVote, closePoll, openPoll, publicPoll, voteStatus, type PollState } from "../src/poll/poll";

const open = (now = 1000, labels = ["Pizza", "Burgers", "Dessert"]): PollState => {
  const r = openPoll(labels, now, () => "p1", 20_000);
  if (!r.ok) throw new Error(r.error);
  return r.poll;
};
const vote = (p: PollState | null, actor: string, optionId: string, now = 2000, extra: object = {}) =>
  castVote(p, actor, { pollId: "p1", optionId, ...extra }, now);

describe("opening", () => {
  it("needs two to six distinct, bounded suggestions", () => {
    expect(openPoll(["only"], 0, () => "p").ok).toBe(false);
    expect(openPoll(["a", "b", "c", "d", "e", "f", "g"], 0, () => "p").ok).toBe(false);
    expect(openPoll(["a", "A "], 0, () => "p").ok).toBe(false);
    expect(openPoll(["a", "x".repeat(41)], 0, () => "p").ok).toBe(false);
    expect(openPoll(["a", "b"], 0, () => "p").ok).toBe(true);
  });
});

describe("ballots", () => {
  it("separate participant identities count separately", () => {
    let p: PollState | null = open();
    p = vote(p, "phone-1", "p1-o1").poll;
    p = vote(p, "phone-2", "p1-o1").poll;
    p = vote(p, "phone-3", "p1-o2").poll;
    p = closePoll(p!);
    const totals = Object.fromEntries(publicPoll(p, 3000).results!.map((r) => [r.optionId, r.votes]));
    expect(totals).toEqual({ "p1-o1": 2, "p1-o2": 1, "p1-o3": 0 });
  });

  it("a retry of the same accepted choice confirms without counting twice", () => {
    let r = vote(open(), "phone-1", "p1-o1", 2000, { requestId: "req-a" });
    expect(r.result).toEqual({ ok: true, status: "accepted", optionId: "p1-o1" });
    r = vote(r.poll, "phone-1", "p1-o1", 2100, { requestId: "req-b" });
    expect(r.result).toEqual({ ok: true, status: "duplicate", optionId: "p1-o1" });
    expect(publicPoll(r.poll!, 2200).responses).toBe(1);
  });

  it("a later different choice is already_voted and does not change the ballot", () => {
    const first = vote(open(), "phone-1", "p1-o1");
    const second = vote(first.poll, "phone-1", "p1-o2");
    expect(second.result).toEqual({ ok: false, reason: "already_voted" });
    expect(voteStatus(second.poll, "phone-1", "p1")).toEqual({ voted: true, optionId: "p1-o1" });
  });

  it("rejects late, stale-poll, unknown-option and malformed votes", () => {
    expect(vote(open(1000), "a", "p1-o1", 21_000).result).toEqual({ ok: false, reason: "closed" });
    expect(castVote(open(), "a", { pollId: "old", optionId: "p1-o1" }, 2000).result).toEqual({ ok: false, reason: "stale_poll" });
    expect(vote(open(), "a", "p1-o9").result).toEqual({ ok: false, reason: "unknown_option" });
    for (const bad of [null, "x", 5, {}, { pollId: 1, optionId: "p1-o1" }, { pollId: "p1" }, { pollId: "p1", optionId: "p1-o1", requestId: 7 }, { pollId: "p1", optionId: "bad id!" }]) {
      expect(castVote(open(), "a", bad, 2000).result).toEqual({ ok: false, reason: "invalid" });
    }
    expect(castVote(null, "a", { pollId: "p1", optionId: "p1-o1" }, 2000).result).toEqual({ ok: false, reason: "no_poll" });
  });

  it("rejects votes after an early close", () => {
    const closed = closePoll(open());
    expect(vote(closed, "a", "p1-o1").result).toEqual({ ok: false, reason: "closed" });
  });

  it("a returning identity can recover its accepted status", () => {
    const p = vote(open(), "phone-1", "p1-o2").poll;
    expect(voteStatus(p, "phone-1", "p1")).toEqual({ voted: true, optionId: "p1-o2" });
    expect(voteStatus(p, "phone-9", "p1")).toEqual({ voted: false });
    expect(voteStatus(p, "phone-1", "other")).toEqual({ voted: false });
  });
});

describe("public view", () => {
  it("shows only a response count while open and never exposes individual ballots", () => {
    const p = vote(open(), "secret-phone-id", "p1-o2").poll!;
    const view = publicPoll(p, 3000);
    expect(view.status).toBe("open");
    expect(view.responses).toBe(1);
    expect(view.results).toBeNull();
    expect(view.remainingMs).toBe(18_000);
    expect(JSON.stringify(view)).not.toContain("secret-phone-id");
  });

  it("closes itself at the host deadline", () => {
    expect(publicPoll(open(1000), 21_000).status).toBe("closed");
  });
});
