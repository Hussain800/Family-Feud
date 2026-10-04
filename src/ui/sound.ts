// Short original tones synthesised with WebAudio. Only the projector window plays them.
// They react to public snapshots and never feed back into scoring.
import type { PublicSnapshot } from "../public/types";

export type Cue = "reveal" | "strike" | "award" | "pollOpen" | "pollClose" | "steal";

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number };

const CUES: Record<Cue, Note[]> = {
  reveal: [
    { f: 784, at: 0, dur: 0.12, type: "triangle" },
    { f: 1175, at: 0.1, dur: 0.28, type: "triangle" },
  ],
  strike: [
    { f: 150, at: 0, dur: 0.42, type: "sawtooth", gain: 0.7 },
    { f: 110, at: 0.05, dur: 0.4, type: "square", gain: 0.5 },
  ],
  steal: [
    { f: 392, at: 0, dur: 0.15, type: "square", gain: 0.5 },
    { f: 330, at: 0.16, dur: 0.15, type: "square", gain: 0.5 },
    { f: 262, at: 0.32, dur: 0.3, type: "square", gain: 0.5 },
  ],
  award: [
    { f: 523, at: 0, dur: 0.14, type: "triangle" },
    { f: 659, at: 0.14, dur: 0.14, type: "triangle" },
    { f: 784, at: 0.28, dur: 0.14, type: "triangle" },
    { f: 1046, at: 0.42, dur: 0.5, type: "triangle" },
  ],
  pollOpen: [{ f: 880, at: 0, dur: 0.1, type: "sine" }, { f: 1320, at: 0.1, dur: 0.14, type: "sine" }],
  pollClose: [{ f: 660, at: 0, dur: 0.12, type: "sine" }, { f: 440, at: 0.12, dur: 0.22, type: "sine" }],
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  volume = 0.6;

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  /** Must run inside a user gesture. Failure is silent: play never depends on audio. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      }
      await this.ctx.resume();
      this.apply();
      return this.unlocked;
    } catch {
      return false;
    }
  }

  apply(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.4;
  }

  play(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.unlocked || this.muted) return;
    const t0 = ctx.currentTime;
    for (const n of CUES[cue]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type ?? "sine";
      osc.frequency.value = n.f;
      g.gain.setValueAtTime(0.0001, t0 + n.at);
      g.gain.exponentialRampToValueAtTime(n.gain ?? 1, t0 + n.at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(g).connect(this.master);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur + 0.05);
    }
  }
}

/** Decide which cue, if any, a change between two public snapshots deserves. */
export function cueFor(prev: PublicSnapshot | null, next: PublicSnapshot): Cue | null {
  if (!prev) return null;
  if (!prev.poll && next.poll?.status === "open") return "pollOpen";
  if (prev.poll?.status === "open" && next.poll?.status === "closed") return "pollClose";
  if (!prev.settlement && next.settlement) return "award";
  if (prev.phase !== "steal" && next.phase === "steal") return "steal";
  if (next.strikes > prev.strikes) return "strike";
  const shown = (s: PublicSnapshot) => s.round?.slots.filter((x) => x.revealed).length ?? 0;
  if (next.round && prev.round?.prompt === next.round.prompt && shown(next) > shown(prev)) return "reveal";
  return null;
}
