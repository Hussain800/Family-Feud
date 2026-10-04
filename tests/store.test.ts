import { describe, expect, it } from "vitest";
import { publishSnapshot, useFeudStore } from "../src/game/store";
import { EMPTY_SNAPSHOT } from "../src/public/types";

// The network-reachable surface. A phone can reach any non-underscore action, and the relay will
// stamp a spoofed call as role "host", so each action must be safe on its own.
const actions = () => useFeudStore.getState().actions;

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
    expect(names.sort()).toEqual([]);
  });

  it("the replicated state holds the snapshot and nothing else", () => {
    const { actions: _a, ...data } = useFeudStore.getState();
    expect(Object.keys(data)).toEqual(["snapshot"]);
  });
});
