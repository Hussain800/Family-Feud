import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { writeJson } from "../src/host/persist";
import { EMPTY_SNAPSHOT, type PublicSnapshot } from "../src/public/types";
import { ScreenView } from "../src/ui/ScreenView";
import { cueFor, musicWanted } from "../src/ui/sound";

// The club wordmark script attaches itself to window; there is no DOM in this test environment.
vi.mock("../src/styles/blue-ice-club.js", () => ({}));

const base: PublicSnapshot = {
  ...EMPTY_SNAPSHOT,
  rev: 1,
  phase: "team_turn",
  control: "A",
  room: { code: "ABCD", joinUrl: "http://192.168.1.2:5173/controller?room=ABCD", status: "ready", connected: 2, capacity: 16 },
  round: {
    number: 1,
    total: 3,
    category: "Food",
    prompt: "Name something you would order at 2 a.m.",
    columns: 1,
    slots: [
      { index: 1, revealed: true, text: "<script>alert(1)</script>", count: 20 },
      { index: 2, revealed: false },
    ],
  },
};

describe("plain-text rendering", () => {
  it("escapes revealed answers, team names and banner text", () => {
    const html = renderToString(
      <ScreenView
        snapshot={{ ...base, teams: [{ id: "A", name: "<b>Foxes</b>", score: 0 }, { id: "B", name: "Owls", score: 0 }] }}
        flash={{ id: 1, kind: "banner", text: "<img src=x onerror=alert(1)>" }}
      />,
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Foxes");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("shows the demo label on the public board whenever the snapshot carries it", () => {
    expect(renderToString(<ScreenView snapshot={{ ...base, demoLabel: "DEMO: INVENTED RESULTS" }} />)).toContain("DEMO: INVENTED RESULTS");
    expect(renderToString(<ScreenView snapshot={base} />)).not.toContain("DEMO:");
  });

  it("concealed tiles render no answer content or points; shown tiles carry the face that flips over", () => {
    const html = renderToString(<ScreenView snapshot={base} />);
    expect(html).toContain('aria-label="2: hidden"');
    expect(html).toMatch(/class="tile tile--shown"[^>]*><span class="tile__inner">/);
    expect(html.split('aria-label="2: hidden"')[1].split("</li>")[0]).not.toMatch(/tile__t"/);
  });

  it("draws the red X and banners only when the projector page passes one", () => {
    expect(renderToString(<ScreenView snapshot={base} />)).not.toContain("flash");
    const x = renderToString(<ScreenView snapshot={base} flash={{ id: 1, kind: "x", count: 3 }} />);
    expect(x.match(/class="flash__x"/g)).toHaveLength(3);
    expect(renderToString(<ScreenView snapshot={base} flash={{ id: 2, kind: "banner", text: "TEAM A PLAYS" }} />)).toContain("TEAM A PLAYS");
  });

  it("between rounds the projector shows the scoreboard, not the join page", () => {
    const html = renderToString(<ScreenView snapshot={{ ...EMPTY_SNAPSHOT, progress: { played: 1, total: 3, tieBreak: false }, teams: [{ id: "A", name: "Foxes", score: 48 }, { id: "B", name: "Owls", score: 12 }] }} />).replace(/<!-- -->/g, ""); // drop React's text-node markers
    expect(html).toContain("AFTER ROUND 1 OF 3");
    expect(html).toContain("Foxes leads");
    expect(html).toContain("ROUND 2 IS NEXT");
    expect(html).not.toContain("ROOM CODE");
  });

  it("physical buzzers: the lobby shows no QR code, room code or phone count", () => {
    const html = renderToString(<ScreenView snapshot={{ ...EMPTY_SNAPSHOT, room: { code: null, joinUrl: null, status: "offline", connected: 0, capacity: 16 } }} />);
    expect(html).not.toMatch(/ROOM|QR|phones? connected|<svg[^>]*qr/i);
  });

  it("phone buzzers: the pairing code shows only while a team still needs its phone, and never for a localhost link", () => {
    const buzzers = { open: false, armId: null, paired: { A: true, B: false }, gen: { A: 1, B: 1 }, online: { A: true, B: false }, first: null, second: null };
    const lobby = (b: PublicSnapshot["buzzers"], joinUrl = base.room.joinUrl) => renderToString(<ScreenView snapshot={{ ...EMPTY_SNAPSHOT, room: { ...base.room, joinUrl }, buzzers: b }} />);
    expect(lobby(buzzers)).toContain("BUZZER PHONES");
    expect(lobby({ ...buzzers, paired: { A: true, B: true } })).not.toContain("BUZZER PHONES");
    expect(lobby(buzzers, "http://localhost:5173/controller?room=ABCD")).not.toContain("BUZZER PHONES");
  });
});

describe("sound cues are derived from public changes only", () => {
  const shown = (n: number): PublicSnapshot => ({ ...base, round: { ...base.round!, slots: base.round!.slots.map((s, i) => (i < n ? { index: i + 1, revealed: true as const, text: "x", count: 1 } : { index: i + 1, revealed: false as const })) } });
  it("maps reveal, strike, steal, award, round start and final", () => {
    expect(cueFor(shown(0), shown(1))).toBe("reveal");
    expect(cueFor(base, { ...base, strikes: 1 })).toBe("strike");
    expect(cueFor({ ...base, strikes: 2 }, { ...base, strikes: 3, phase: "steal" })).toBe("strike"); // the third X first; the page follows with the steal
    expect(cueFor(base, { ...base, settlement: { winner: "A", amount: 5, kind: "clear" } })).toBe("award");
    expect(cueFor({ ...base, phase: "lobby" }, { ...base, phase: "intro" })).toBe("roundStart");
    expect(cueFor(base, { ...base, phase: "match_over" })).toBe("final");
  });

  it("a failed steal gets the X; a successful one gets the reveal", () => {
    const steal = { ...shown(1), phase: "steal" as const, strikes: 3 };
    expect(cueFor(steal, { ...steal, phase: "round_over" })).toBe("stealMiss");
    expect(cueFor(steal, { ...shown(2), phase: "round_over", strikes: 3 })).toBe("reveal");
  });

  it("an Undo makes no sound or effect, whatever it changes", () => {
    expect(cueFor({ ...base, phase: "round_over" }, { ...base, phase: "steal", undone: true })).toBeNull();
    expect(cueFor(shown(0), { ...shown(1), undone: true })).toBeNull();
  });

  it("plays the theme only between rounds, on the intro and at the end; live play is silent", () => {
    for (const phase of ["lobby", "intro", "match_over"] as const) expect(musicWanted({ ...base, phase })).toBe(true);
    for (const phase of ["board_ready", "team_turn", "steal", "round_over", "preview"] as const) expect(musicWanted({ ...base, phase })).toBe(false);
  });
  it("is silent for no change, the first snapshot, or a new round", () => {
    expect(cueFor(null, base)).toBeNull();
    expect(cueFor(base, base)).toBeNull();
    expect(cueFor(shown(1), { ...shown(0), round: { ...shown(0).round!, prompt: "Another question" } })).toBeNull();
  });
});

describe("tie-break and countdown on the projector", () => {
  const tb = { ...base, progress: { played: 3, total: 4, tieBreak: true } };
  it("calls the extra round a tie-break everywhere it would say ROUND n OF m", () => {
    const board = renderToString(<ScreenView snapshot={tb} />).replace(/<!-- -->/g, "");
    expect(board).toContain("TIE-BREAK");
    expect(board).not.toContain("ROUND 1 OF 3");
    expect(renderToString(<ScreenView snapshot={{ ...tb, phase: "intro" }} />).replace(/<!-- -->/g, "")).toContain("TIE-BREAK");
    const between = renderToString(<ScreenView snapshot={{ ...EMPTY_SNAPSHOT, progress: tb.progress, teams: [{ id: "A", name: "Foxes", score: 40 }, { id: "B", name: "Owls", score: 40 }] }} />).replace(/<!-- -->/g, "");
    expect(between).toContain("All square");
    expect(between).toContain("TIE-BREAK IS NEXT");
    expect(renderToString(<ScreenView snapshot={base} />)).not.toContain("TIE-BREAK");
  });

  it("shows the seconds left, then TIME", () => {
    const run = (ms: number) => renderToString(<ScreenView snapshot={{ ...base, timer: { endsAt: Date.now() + ms, durationMs: 10000 } }} />).replace(/<!-- -->/g, "");
    expect(run(7400)).toMatch(/role="timer"[^>]*aria-label="8 seconds left"/);
    expect(run(-500)).toContain("TIME");
    expect(renderToString(<ScreenView snapshot={base} />)).not.toContain('role="timer"');
  });
});

describe("question intro", () => {
  it("does not name a starting team: the face-off decides it", () => {
    const html = renderToString(<ScreenView snapshot={{ ...base, phase: "intro", control: "A" }} />).replace(/<!-- -->/g, "");
    expect(html).toContain("FACE-OFF NEXT");
    expect(html).not.toMatch(/STARTS/);
  });
});

describe("face-off on the projector", () => {
  const fo = { buzzed: null, tries: { A: null, B: null }, awaitingHosts: false, winner: null, choice: null } as const;
  const view = (faceOff: PublicSnapshot["faceOff"], phase: PublicSnapshot["phase"] = "face_off") =>
    renderToString(<ScreenView snapshot={{ ...base, phase, faceOff }} />).replace(/<!-- -->/g, "");

  it("walks the room through the first buzz, the other player, the winner and the choice", () => {
    expect(view(fo)).toContain("ONE PLAYER FROM EACH TEAM TO THE BUZZERS");
    expect(view({ ...fo, buzzed: "A" })).toContain("TEAM A BUZZED FIRST: ANSWER NOW");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: null } })).toContain("TEAM B: YOUR ANSWER");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: null }, awaitingHosts: true })).toContain("OVER TO THE HOSTS: WHO WINS THE FACE-OFF?");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: null }, awaitingHosts: true })).not.toContain("YOUR ANSWER");
    expect(view({ ...fo, buzzed: "A", tries: { A: "miss", B: "miss" } })).toContain("BOTH MISSED: NEXT TWO PLAYERS");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: "miss" }, winner: "A" }, "play_or_pass")).toContain("TEAM A WINS THE FACE-OFF: PLAY OR PASS?");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: "miss" }, winner: "A", choice: "pass" }, "play_or_pass")).toContain("TEAM A PASSES");
  });

  it("shows the team lamps in a face-off and no face-off bar during normal play", () => {
    expect(view({ ...fo, buzzed: "B" })).toContain("BUZZED FIRST");
    expect(renderToString(<ScreenView snapshot={{ ...base, faceOff: fo }} />)).not.toContain("FACE-OFF");
  });

  it("cues: a buzz, a miss, a face-off winner, play or pass", () => {
    const f = (x: Partial<NonNullable<PublicSnapshot["faceOff"]>>) => ({ ...base, phase: "face_off" as const, faceOff: { ...fo, ...x } });
    expect(cueFor(f({}), f({ buzzed: "B" }))).toBe("buzz");
    expect(cueFor(f({ buzzed: "B" }), f({ buzzed: "B", tries: { A: null, B: "miss" } }))).toBe("faceoffMiss");
    expect(cueFor(f({ buzzed: "B", tries: { A: "miss", B: "miss" } }), f({ buzzed: "A" }))).toBeNull(); // the next attempt clears the misses quietly
    expect(cueFor(f({ buzzed: "B" }), f({ buzzed: "B", winner: "B", tries: { A: null, B: "hit" } }))).toBe("faceoffWin");
    expect(cueFor(f({ buzzed: "B", winner: "B" }), { ...f({ buzzed: "B", winner: "B", choice: "pass" }), phase: "team_turn" })).toBe("pass");
  });

  it("phone mode labels the arrival time honestly", () => {
    const html = view({ ...fo, buzzed: "A" }).concat(renderToString(<ScreenView snapshot={{ ...base, phase: "face_off", faceOff: { ...fo, buzzed: "A" }, buzzers: { open: false, armId: "x", paired: { A: true, B: true }, gen: { A: 1, B: 1 }, online: { A: true, B: true }, first: { team: "A", ms: 843 }, second: { team: "B", ms: 1020 } } }} />).replace(/<!-- -->/g, ""));
    expect(html).toContain("RECEIVED 0.84 S AFTER THE BUZZERS OPENED");
    expect(html).toContain("TEAM B 0.18 S LATER");
    expect(html).not.toMatch(/PROOF|REACTION/);
  });
});

describe("storage failure feedback", () => {
  it("reports a failed write instead of throwing", () => {
    const real = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { setItem: () => { throw new Error("QuotaExceededError"); }, getItem: () => null },
    });
    try {
      const r = writeJson("k", { a: 1 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/Quota/);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: real });
    }
  });
});
