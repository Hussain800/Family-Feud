// Same-origin bridge from the moderator window to the projector window on the same laptop.
// The projector is not an Air Jam host and never reads the answer pack or host storage.
import type { PublicSnapshot } from "./types";

const NAME = "gdg-ff-public";

export type ChannelMessage =
  | { kind: "snapshot"; snapshot: PublicSnapshot }
  | { kind: "heartbeat"; rev: number }
  | { kind: "request" };

export const HEARTBEAT_MS = 2000;
export const STALE_AFTER_MS = 6000;

export function openChannel(onMessage: (m: ChannelMessage) => void): { post: (m: ChannelMessage) => void; close: () => void } {
  if (typeof BroadcastChannel === "undefined") return { post: () => {}, close: () => {} };
  const ch = new BroadcastChannel(NAME);
  ch.onmessage = (e: MessageEvent<ChannelMessage>) => onMessage(e.data);
  return { post: (m) => ch.postMessage(m), close: () => ch.close() };
}
