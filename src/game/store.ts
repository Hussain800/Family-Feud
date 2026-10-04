/**
 * The Air Jam replicated store. It is the phone transport, not the game authority.
 *
 * Everything in this store's state is broadcast to every connected phone, so it holds the
 * public snapshot and nothing else. The answer pack and the game engine live on the moderator
 * page only.
 *
 * Role boundary (verified with scripts/probe-airjam.mjs against the real server): a phone can
 * send `controller:host_action_rpc`, and the server then stamps the actor as `host`. So a
 * `ctx.role === "host"` check is NOT a defence. The host publishes through `_publish`, whose
 * "_" prefix makes the server reject it on both RPC channels.
 */
import { createAirJamStore, type AirJamActionContext } from "@air-jam/sdk";
import { EMPTY_SNAPSHOT, type PublicSnapshot } from "../public/types";

export interface FeudState {
  snapshot: PublicSnapshot;
  actions: {
    _publish: (ctx: AirJamActionContext, payload: { snapshot: PublicSnapshot }) => void;
  };
}

export const useFeudStore = createAirJamStore<FeudState>((set) => ({
  snapshot: EMPTY_SNAPSHOT,
  actions: {
    _publish: (ctx, { snapshot }) => {
      if (ctx.role !== "host") return;
      set({ snapshot });
    },
  },
}));

/** Host-side publish. Calls the internal action directly because dispatch skips "_" actions by design. */
export const publishSnapshot = (snapshot: PublicSnapshot): void =>
  useFeudStore.getState().actions._publish({ actorId: "host", role: "host", connectedPlayerIds: [] }, { snapshot });
