/**
 * The Air Jam replicated store. It is the phone transport, not the game authority.
 *
 * Everything in this store's state is broadcast to every connected phone, so it holds the
 * public snapshot and nothing else. The answer pack and the game engine live on the moderator
 * page only.
 *
 * Role boundary (verified with scripts/probe-airjam.mjs against the real server): a phone can
 * send `controller:host_action_rpc`, and the server then stamps the actor as `host`. So a
 * `ctx.role === "host"` check is NOT a defence. The only network-reachable actions are
 * castVote and pollStatus, both of which treat phones as untrusted. The host publishes through
 * `_publish`, whose "_" prefix makes the server reject it on both RPC channels.
 */
import { acceptAirJamAction, createAirJamStore, rejectAirJamAction, type AirJamActionContext } from "@air-jam/sdk";
import type { VoteResult } from "../poll/poll";
import { EMPTY_SNAPSHOT, type PublicSnapshot } from "../public/types";

export interface FeudState {
  snapshot: PublicSnapshot;
  actions: {
    castVote: (ctx: AirJamActionContext, payload: { pollId: string; optionId: string; requestId?: string }) => unknown;
    pollStatus: (ctx: AirJamActionContext, payload: { pollId: string }) => unknown;
    _publish: (ctx: AirJamActionContext, payload: { snapshot: PublicSnapshot }) => void;
  };
}

/** The moderator page installs these. Without them (no host mounted) votes are refused. */
export const hostHandlers: {
  cast: ((actorId: string, payload: unknown) => VoteResult) | null;
  status: ((actorId: string, pollId: string) => { voted: boolean; optionId?: string }) | null;
} = { cast: null, status: null };

const REJECT_TEXT: Record<Extract<VoteResult, { ok: false }>["reason"], string> = {
  no_poll: "There is no poll right now.",
  stale_poll: "That poll has ended.",
  closed: "Voting is closed.",
  invalid: "That vote was not understood.",
  unknown_option: "That option does not exist.",
  already_voted: "You already voted in this poll.",
};

export const useFeudStore = createAirJamStore<FeudState>((set) => ({
  snapshot: EMPTY_SNAPSHOT,
  actions: {
    castVote: (ctx, payload) => {
      // Only a genuine controller connection counts as a participant.
      if (ctx.role !== "controller" || !ctx.actorId || ctx.actorId === "host") {
        return rejectAirJamAction("forbidden", "Only a phone can vote.");
      }
      const r = hostHandlers.cast?.(ctx.actorId, payload) ?? ({ ok: false, reason: "no_poll" } as VoteResult);
      return r.ok ? acceptAirJamAction({ status: r.status, optionId: r.optionId }) : rejectAirJamAction(r.reason, REJECT_TEXT[r.reason]);
    },
    pollStatus: (ctx, payload) => {
      if (ctx.role !== "controller" || !ctx.actorId || typeof payload?.pollId !== "string") {
        return rejectAirJamAction("forbidden", "Only a phone can ask.");
      }
      return acceptAirJamAction(hostHandlers.status?.(ctx.actorId, payload.pollId) ?? { voted: false });
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
