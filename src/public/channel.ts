// Same-origin bridge from the moderator window to the projector window on the same laptop.
// The projector is not an Air Jam host and never reads the answer pack or host storage.
import type { PublicSnapshot } from "./types";

const NAME = "gdg-ff-public";

/** What the projector says about its sound: on, muted by the operator, or blocked until someone clicks it. */
export type ScreenSound = "on" | "muted" | "off";

export type ChannelMessage =
  | { kind: "snapshot"; snapshot: PublicSnapshot }
  | { kind: "heartbeat"; rev: number }
  | { kind: "request" }
  /** Projector to console, every heartbeat: it is open, and this is its sound. */
  | { kind: "screen"; sound: ScreenSound }
  /** Console to projector: play a short test cue. */
  | { kind: "test-sound" };

export const HEARTBEAT_MS = 2000;
export const STALE_AFTER_MS = 6000;

export function openChannel(onMessage: (m: ChannelMessage) => void): { post: (m: ChannelMessage) => void; close: () => void } {
  if (typeof BroadcastChannel === "undefined") return { post: () => {}, close: () => {} };
  const ch = new BroadcastChannel(NAME);
  ch.onmessage = (e: MessageEvent<ChannelMessage>) => onMessage(e.data);
  return { post: (m) => ch.postMessage(m), close: () => ch.close() };
}
