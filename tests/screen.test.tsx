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
  it("escapes revealed answers, team names and poll labels", () => {
    const html = renderToString(
      <ScreenView
        snapshot={{
          ...base,
          teams: [{ id: "A", name: "<b>Foxes</b>", score: 0 }, { id: "B", name: "Owls", score: 0 }],
          poll: { id: "p", status: "open", options: [{ id: "o1", label: "<img src=x onerror=alert(1)>" }, { id: "o2", label: "Two" }], durationMs: 20000, remainingMs: 20000, responses: 0, results: null },
        }}
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

  it("concealed tiles render no answer content or points", () => {
    const html = renderToString(<ScreenView snapshot={base} />);
    expect(html).toContain('aria-label="2: hidden"');
  });

  it("between rounds the projector shows the scoreboard, not the join page", () => {
    const html = renderToString(<ScreenView snapshot={{ ...EMPTY_SNAPSHOT, progress: { played: 1, total: 3, tieBreak: false }, teams: [{ id: "A", name: "Foxes", score: 48 }, { id: "B", name: "Owls", score: 12 }] }} />).replace(/<!-- -->/g, ""); // drop React's text-node markers
    expect(html).toContain("AFTER ROUND 1 OF 3");
    expect(html).toContain("Foxes leads");
    expect(html).toContain("ROUND 2 IS NEXT");
    expect(html).not.toContain("ROOM CODE");
  });

  it("a lobby without a usable join address says so instead of drawing a dead QR", () => {
    const html = renderToString(<ScreenView snapshot={{ ...EMPTY_SNAPSHOT, room: { ...base.room, joinUrl: "http://localhost:5173/controller?room=ABCD" } }} />);
    expect(html).toContain("Phones cannot reach this address");
  });
});

describe("sound cues are derived from public changes only", () => {
  const shown = (n: number): PublicSnapshot => ({ ...base, round: { ...base.round!, slots: base.round!.slots.map((s, i) => (i < n ? { index: i + 1, revealed: true as const, text: "x", count: 1 } : { index: i + 1, revealed: false as const })) } });
  it("maps reveal, strike, steal, award, poll open and close", () => {
    expect(cueFor(shown(0), shown(1))).toBe("reveal");
    expect(cueFor(base, { ...base, strikes: 1 })).toBe("strike");
    expect(cueFor({ ...base, strikes: 2 }, { ...base, strikes: 3, phase: "steal" })).toBe("steal");
    expect(cueFor(base, { ...base, settlement: { winner: "A", amount: 5, kind: "clear" } })).toBe("award");
    const poll = { id: "p", status: "open" as const, options: [], durationMs: 1, remainingMs: 1, responses: 0, results: null };
    expect(cueFor(base, { ...base, poll })).toBe("pollOpen");
    expect(cueFor({ ...base, poll }, { ...base, poll: { ...poll, status: "closed" } })).toBe("pollClose");
    expect(cueFor({ ...base, phase: "lobby" }, { ...base, phase: "intro" })).toBe("roundStart");
    expect(cueFor(base, { ...base, phase: "match_over" })).toBe("final");
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
  const fo = { armed: false, buzzed: null, tries: { A: null, B: null }, winner: null, choice: null } as const;
  const view = (faceOff: PublicSnapshot["faceOff"], phase: PublicSnapshot["phase"] = "face_off") =>
    renderToString(<ScreenView snapshot={{ ...base, phase, faceOff }} />).replace(/<!-- -->/g, "");

  it("walks the room through open buzzers, first buzz, the other player, the winner and the choice", () => {
    expect(view(fo)).toContain("ONE PLAYER FROM EACH TEAM TO THE BUZZERS");
    expect(view({ ...fo, armed: true })).toContain("BUZZERS LIVE");
    expect(view({ ...fo, buzzed: "A" })).toContain("TEAM A BUZZED FIRST: ANSWER NOW");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: null } })).toContain("TEAM B: YOUR ANSWER");
    expect(view({ ...fo, buzzed: "A", tries: { A: "miss", B: "miss" } })).toContain("BOTH MISSED: NEXT TWO PLAYERS");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: "miss" }, winner: "A" }, "play_or_pass")).toContain("TEAM A WINS THE FACE-OFF: PLAY OR PASS?");
    expect(view({ ...fo, buzzed: "A", tries: { A: "hit", B: "miss" }, winner: "A", choice: "pass" }, "play_or_pass")).toContain("TEAM A PASSES");
  });

  it("shows the board, the team lamps and no face-off bar during normal play", () => {
    const html = view({ ...fo, armed: true });
    expect(html).toContain("BUZZER LIVE");
    expect(renderToString(<ScreenView snapshot={{ ...base, faceOff: fo }} />)).not.toContain("FACE-OFF");
  });

  it("cues: live buzzers, a buzz, a face-off winner", () => {
    const f = (x: Partial<NonNullable<PublicSnapshot["faceOff"]>>) => ({ ...base, phase: "face_off" as const, faceOff: { ...fo, ...x } });
    expect(cueFor(f({}), f({ armed: true }))).toBe("buzzersLive");
    expect(cueFor(f({ armed: true }), f({ buzzed: "B" }))).toBe("buzz");
    expect(cueFor(f({ buzzed: "B" }), f({ buzzed: "B", winner: "B", tries: { A: null, B: "hit" } }))).toBe("faceoffWin");
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
