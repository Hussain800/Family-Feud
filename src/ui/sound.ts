// Original sound design, synthesised live with WebAudio. Nothing here is sampled or copied from any show.
// Only the projector window plays it. Cues react to public snapshots and never feed back into scoring.
import type { PublicSnapshot } from "../public/types";

export type Cue = "reveal" | "strike" | "steal" | "award" | "roundStart" | "final" | "pollOpen" | "pollClose" | "tick" | "buzzersLive" | "buzz" | "faceoffWin";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// ---- the theme: 8 bars, 118 BPM, G major (I - V - vi - IV, two bars each) ----------------------------
const BPM = 118;
const STEP = 60 / BPM / 4; // one sixteenth note
const BARS = 8;
const CHORDS: number[][] = [
  [55, 59, 62], // G
  [55, 59, 62],
  [50, 54, 57], // D
  [50, 54, 57],
  [52, 55, 59], // Em
  [52, 55, 59],
  [48, 52, 55], // C
  [48, 52, 55],
];
const ROOTS = [43, 43, 38, 38, 40, 40, 36, 36];
// melody: [step in bar, midi note, length in steps]
const MELODY: [number, number, number][][] = [
  [[0, 71, 2], [2, 74, 2], [4, 79, 4], [8, 76, 2], [10, 74, 2], [12, 71, 4]],
  [[0, 69, 2], [2, 71, 2], [4, 74, 4], [8, 71, 4], [12, 69, 4]],
  [[0, 69, 2], [2, 74, 2], [4, 78, 4], [8, 76, 2], [10, 74, 2], [12, 69, 4]],
  [[0, 66, 2], [2, 69, 2], [4, 74, 6], [12, 76, 2], [14, 74, 2]],
  [[0, 76, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 76, 4]],
  [[0, 74, 2], [2, 76, 2], [4, 79, 4], [8, 76, 4], [12, 74, 4]],
  [[0, 76, 2], [2, 79, 2], [4, 84, 4], [8, 83, 2], [10, 81, 2], [12, 79, 4]],
  [[0, 76, 4], [4, 74, 4], [8, 79, 6], [14, 81, 2]],
];

export class Sfx {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private nextStep = 0;
  private stepIndex = 0;
  private wantMusic = false;
  muted = false;
  musicOn = true;
  volume = 0.7;

  get unlocked(): boolean {
    return this.ctx?.state === "running";
  }

  /** Must run inside a user gesture. Failure is silent: play never depends on audio. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        this.ctx = ctx;
        const comp = ctx.createDynamicsCompressor(); // keeps loud cues from clipping the speakers
        comp.connect(ctx.destination);
        this.sfxBus = ctx.createGain();
        this.musicBus = ctx.createGain();
        this.sfxBus.connect(comp);
        this.musicBus.connect(comp);
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      }
      await this.ctx.resume();
      this.apply();
      if (this.wantMusic) this.startLoop();
      return this.unlocked;
    } catch {
      return false;
    }
  }

  apply(): void {
    const now = this.ctx?.currentTime ?? 0;
    this.sfxBus?.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.9, now, 0.02);
    this.musicBus?.gain.setTargetAtTime(this.muted || !this.musicOn || !this.wantMusic ? 0 : this.volume * 0.38, now, 0.25);
  }

  // ---- building blocks -------------------------------------------------------------------------
  private tone(f: number, at: number, dur: number, type: OscillatorType, gain: number, bus: GainNode, opts: { to?: number; cutoff?: number; attack?: number; detune?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, at);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const a = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + a);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = osc;
    if (opts.cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = opts.cutoff;
      osc.connect(lp);
      node = lp;
    }
    node.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private hiss(at: number, dur: number, type: BiquadFilterType, freq: number, gain: number, bus: GainNode, sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  private bell(f: number, at: number, gain: number, bus: GainNode) {
    // a struck-bell tone: a few inharmonic partials with different decays
    [[1, 1, 0.9], [2.76, 0.45, 0.5], [5.4, 0.25, 0.3], [8.9, 0.12, 0.18]].forEach(([r, g, d]) => this.tone(f * r, at, d, "sine", gain * g, bus));
  }

  private brass(midi: number[], at: number, dur: number, gain: number, bus: GainNode) {
    midi.forEach((m) => {
      this.tone(hz(m), at, dur, "sawtooth", gain, bus, { cutoff: 2600, attack: 0.03, detune: -7 });
      this.tone(hz(m), at, dur, "sawtooth", gain, bus, { cutoff: 2600, attack: 0.03, detune: 7 });
    });
  }

  // ---- effects ---------------------------------------------------------------------------------
  play(cue: Cue): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.unlocked || this.muted) return;
    const t = ctx.currentTime + 0.02;
    switch (cue) {
      case "reveal": // whoosh, DING, sparkle
        this.hiss(t, 0.22, "bandpass", 500, 0.35, bus, 5000);
        this.bell(hz(84), t + 0.2, 0.5, bus);
        [88, 91, 96].forEach((m, i) => this.tone(hz(m), t + 0.32 + i * 0.07, 0.35, "triangle", 0.18, bus));
        break;
      case "strike": // big low BZZT, twice
        [0, 0.28].forEach((d) => {
          this.tone(110, t + d, 0.24, "sawtooth", 0.75, bus, { to: 82, cutoff: 900 });
          this.tone(116, t + d, 0.24, "square", 0.4, bus, { to: 84, cutoff: 900 });
          this.hiss(t + d, 0.1, "lowpass", 600, 0.3, bus);
        });
        break;
      case "steal": // rising, wobbly "uh-oh" siren
        this.tone(330, t, 0.7, "sawtooth", 0.35, bus, { to: 740, cutoff: 1800, attack: 0.05 });
        this.tone(335, t, 0.7, "square", 0.2, bus, { to: 750, cutoff: 1800, attack: 0.05 });
        [0.75, 0.9, 1.05].forEach((d, i) => this.bell(hz(72 + i * 4), t + d, 0.28, bus));
        break;
      case "award": // brass fanfare with a cymbal wash
        this.brass([67, 71, 74], t, 0.22, 0.14, bus);
        this.brass([72, 76, 79], t + 0.22, 0.22, 0.14, bus);
        this.brass([74, 78, 81], t + 0.44, 0.22, 0.14, bus);
        this.brass([79, 83, 86], t + 0.66, 0.9, 0.16, bus);
        this.hiss(t + 0.66, 0.9, "highpass", 6000, 0.22, bus);
        this.bell(hz(91), t + 0.7, 0.3, bus);
        break;
      case "roundStart": // quick rising sting
        [0, 0.09, 0.18, 0.27].forEach((d, i) => this.tone(hz(67 + i * 4), t + d, 0.18, "square", 0.2, bus, { cutoff: 3000 }));
        this.brass([79, 83, 86], t + 0.38, 0.5, 0.12, bus);
        this.hiss(t, 0.5, "bandpass", 800, 0.18, bus, 6000);
        break;
      case "final": // bigger fanfare
        this.brass([55, 59, 62], t, 0.3, 0.14, bus);
        this.brass([62, 66, 69], t + 0.3, 0.3, 0.14, bus);
        this.brass([67, 71, 74], t + 0.6, 0.3, 0.14, bus);
        this.brass([71, 74, 79, 83], t + 0.9, 1.6, 0.16, bus);
        this.hiss(t + 0.9, 1.6, "highpass", 5000, 0.25, bus);
        [0, 0.12, 0.24, 0.36].forEach((d, i) => this.bell(hz(91 + i * 2), t + 1.0 + d, 0.22, bus));
        break;
      case "pollOpen":
        this.hiss(t, 0.3, "bandpass", 700, 0.25, bus, 4500);
        [76, 83, 88].forEach((m, i) => this.tone(hz(m), t + 0.12 + i * 0.08, 0.3, "triangle", 0.28, bus));
        break;
      case "pollClose":
        this.bell(hz(79), t, 0.4, bus);
        this.bell(hz(72), t + 0.14, 0.4, bus);
        break;
      case "tick":
        this.tone(1400, t, 0.06, "square", 0.12, bus, { cutoff: 3500 });
        break;
      case "buzzersLive": // two quick rising pings: "hands on buzzers"
        [84, 91].forEach((m, i) => this.tone(hz(m), t + i * 0.11, 0.18, "triangle", 0.3, bus));
        break;
      case "buzz": // loud game-show buzz-in: harsh honk plus a bell on top
        this.tone(196, t, 0.45, "sawtooth", 0.8, bus, { cutoff: 1500 });
        this.tone(294, t, 0.45, "square", 0.45, bus, { cutoff: 1500 });
        this.hiss(t, 0.12, "bandpass", 1200, 0.35, bus, 3000);
        this.bell(hz(96), t + 0.04, 0.35, bus);
        break;
      case "faceoffWin": // short brass sting
        this.brass([67, 71, 74], t, 0.16, 0.14, bus);
        this.brass([72, 76, 79], t + 0.16, 0.16, 0.14, bus);
        this.brass([79, 83, 86], t + 0.32, 0.6, 0.16, bus);
        this.bell(hz(91), t + 0.34, 0.3, bus);
        break;
    }
  }

  // ---- theme music -----------------------------------------------------------------------------
  /** Ask for the theme to be on or off. It only sounds once audio is unlocked and music is enabled. */
  setMusic(on: boolean): void {
    this.wantMusic = on;
    this.apply();
    if (on) this.startLoop();
    else this.stopLoopSoon();
  }

  private startLoop() {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.timer) return;
    this.stepIndex = 0;
    this.nextStep = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 80);
    this.schedule();
  }

  private stopLoopSoon() {
    window.setTimeout(() => {
      if (!this.wantMusic && this.timer) {
        window.clearInterval(this.timer);
        this.timer = 0;
      }
    }, 900);
  }

  private schedule() {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    while (this.nextStep < ctx.currentTime + 0.3) {
      const total = BARS * 16;
      const s = this.stepIndex % total;
      const bar = Math.floor(s / 16);
      const k = s % 16;
      const at = this.nextStep;
      // drums: kick on the beat, clap on 2 and 4, hats on every eighth
      if (k % 4 === 0) this.tone(150, at, 0.16, "sine", 0.9, bus, { to: 45, attack: 0.002 });
      if (k === 4 || k === 12) this.hiss(at, 0.12, "bandpass", 1800, 0.35, bus);
      if (k % 2 === 0) this.hiss(at, 0.04, "highpass", 8000, k % 4 === 2 ? 0.22 : 0.12, bus);
      // bass: root, octave bounce
      if (k % 4 === 0 || k % 8 === 6) this.tone(hz(ROOTS[bar] + (k % 8 === 6 ? 12 : 0)), at, STEP * 3, "sawtooth", 0.3, bus, { cutoff: 700 });
      // chord stabs on the off-beats
      if (k === 2 || k === 7 || k === 10 || k === 14) this.brass(CHORDS[bar].map((m) => m + 12), at, STEP * 2.2, 0.05, bus);
      // melody
      for (const [st, note, len] of MELODY[bar]) {
        if (st === k) this.tone(hz(note), at, STEP * len * 0.95, "square", 0.07, bus, { cutoff: 3200, attack: 0.01 });
      }
      this.nextStep += STEP;
      this.stepIndex++;
    }
  }
}

/** Decide which cue, if any, a change between two public snapshots deserves. */
export function cueFor(prev: PublicSnapshot | null, next: PublicSnapshot): Cue | null {
  if (!prev) return null;
  if (!prev.poll && next.poll?.status === "open") return "pollOpen";
  if (prev.poll?.status === "open" && next.poll?.status === "closed") return "pollClose";
  if (!prev.faceOff?.buzzed && next.faceOff?.buzzed) return "buzz";
  if (!prev.faceOff?.winner && next.faceOff?.winner && !next.settlement) return "faceoffWin";
  if (!prev.faceOff?.armed && next.faceOff?.armed) return "buzzersLive";
  if (prev.phase !== "match_over" && next.phase === "match_over") return "final";
  if (!prev.settlement && next.settlement) return "award";
  if (prev.phase !== "steal" && next.phase === "steal") return "steal";
  if (prev.phase !== "intro" && next.phase === "intro") return "roundStart";
  if (next.strikes > prev.strikes) return "strike";
  const shown = (s: PublicSnapshot) => s.round?.slots.filter((x) => x.revealed).length ?? 0;
  if (next.round && prev.round?.prompt === next.round.prompt && shown(next) > shown(prev)) return "reveal";
  return null;
}

/** The theme plays between rounds, on the intro, and at the end; the host talks over live play in silence. */
export const musicWanted = (s: PublicSnapshot): boolean => s.phase === "lobby" || s.phase === "intro" || s.phase === "match_over";
