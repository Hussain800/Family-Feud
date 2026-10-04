import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { writeJson } from "../src/host/persist";
import { EMPTY_SNAPSHOT, type PublicSnapshot } from "../src/public/types";
import { ScreenView } from "../src/ui/ScreenView";
import { cueFor } from "../src/ui/sound";

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
  });
  it("is silent for no change, the first snapshot, or a new round", () => {
    expect(cueFor(null, base)).toBeNull();
    expect(cueFor(base, base)).toBeNull();
    expect(cueFor(shown(1), { ...shown(0), round: { ...shown(0).round!, prompt: "Another question" } })).toBeNull();
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
