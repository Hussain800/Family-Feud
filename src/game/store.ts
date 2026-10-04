/**
 * The Air Jam replicated store. It is the phone transport, not the game authority.
 *
 * Everything in this store's state is broadcast to every connected phone, so it holds the
 * public snapshot and nothing else. The answer pack and the game engine live on the moderator
 * page only.
 *
 * Role boundary (verified with scripts/probe-airjam.mjs against the real server): a phone can
 * send `controller:host_action_rpc`, and the server then stamps the actor as `host`. So a
 * `ctx.role === "host"` check is NOT a defence. The only network-reachable actions are the two
 * buzzer calls below, and both treat phones as untrusted: the team comes from the moderator's
 * pairing, never the payload. The host publishes through `_publish`, whose "_" prefix makes the
 * server reject it on both RPC channels.
 */
import { acceptAirJamAction, createAirJamStore, rejectAirJamAction, type AirJamActionContext } from "@air-jam/sdk";
import type { PairResult, PressResult } from "../buzzers/buzzers";
import { EMPTY_SNAPSHOT, type PublicSnapshot } from "../public/types";

export interface FeudState {
  snapshot: PublicSnapshot;
  actions: {
    pairBuzzer: (ctx: AirJamActionContext, payload: { code: string }) => unknown;
    buzz: (ctx: AirJamActionContext, payload: { armId: string; token: string }) => unknown;
    _publish: (ctx: AirJamActionContext, payload: { snapshot: PublicSnapshot }) => void;
  };
}

/** The moderator page installs these while phone buzzers are on. Without them every press is refused. */
export const buzzerHandlers: {
  pair: ((actorId: string, payload: unknown) => PairResult) | null;
  press: ((actorId: string, payload: unknown) => PressResult) | null;
} = { pair: null, press: null };

const TEXT: Record<string, string> = {
  invalid: "That was not understood.",
  wrong_code: "That code is not right. Check it with the moderator.",
  locked: "Too many wrong codes. Ask the moderator for new codes.",
  not_paired: "This phone is not paired with a team.",
  not_open: "The buzzers are not open.",
  stale: "Too late: the buzzers were reset.",
  off: "Phone buzzers are off for this game.",
};

// Only a genuine controller connection counts. A call stamped "host" came through the spoofable host channel.
const isPhone = (ctx: AirJamActionContext) => ctx.role === "controller" && !!ctx.actorId && ctx.actorId !== "host";

export const useFeudStore = createAirJamStore<FeudState>((set) => ({
  snapshot: EMPTY_SNAPSHOT,
  actions: {
    pairBuzzer: (ctx, payload) => {
      if (!isPhone(ctx)) return rejectAirJamAction("forbidden", "Only a phone can pair.");
      if (!buzzerHandlers.pair) return rejectAirJamAction("off", TEXT.off);
      const r = buzzerHandlers.pair(ctx.actorId!, payload);
      return r.ok ? acceptAirJamAction({ team: r.team, token: r.token, gen: r.gen }) : rejectAirJamAction(r.reason, TEXT[r.reason]);
    },
    buzz: (ctx, payload) => {
      if (!isPhone(ctx)) return rejectAirJamAction("forbidden", "Only a phone can buzz.");
      if (!buzzerHandlers.press) return rejectAirJamAction("off", TEXT.off);
      const r = buzzerHandlers.press(ctx.actorId!, payload);
      return r.ok ? acceptAirJamAction({ status: r.status, team: r.team }) : rejectAirJamAction(r.reason, TEXT[r.reason]);
    },
    _publish: (ctx, { snapshot }) => {
      if (ctx.role !== "host") return;
      set({ snapshot });
    },
  },
}));

/** Host-side publish. Calls the internal action directly because dispatch skips "_" actions by design. */
export const publishSnapshot = (snapshot: PublicSnapshot): void =>
  useFeudStore.getState().actions._publish({ actorId: "host", role: "host", connectedPlayerIds: [] }, { snapshot });
