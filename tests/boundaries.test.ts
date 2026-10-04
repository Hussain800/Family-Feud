import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static guard for the public/private boundary. The projector and phone code must never import the
// answer pack, host storage or the host console, and rules code must stay free of React.
const SRC = join(__dirname, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const read = (p: string) => readFileSync(p, "utf8");
const importsOf = (src: string) => [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("public surfaces", () => {
  const surfaces = [...files(join(SRC, "screen")), ...files(join(SRC, "ui")), ...files(join(SRC, "play"))];

  it("never import the host console, host storage, the pack loader or the validator", () => {
    for (const f of surfaces) {
      for (const i of importsOf(read(f))) {
        expect(i, f).not.toMatch(/\/host\//);
        expect(i, f).not.toMatch(/content\/(canonical|schema)/);
        expect(i, f).not.toMatch(/persist/);
      }
    }
  });

  it("never touch browser storage", () => {
    for (const f of surfaces) expect(read(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it("only ever read the public snapshot types", () => {
    for (const f of surfaces) {
      for (const i of importsOf(read(f))) {
        if (/engine\/(reducer)/.test(i)) throw new Error(`${f} imports the rules engine`);
      }
    }
  });
});

describe("rules code", () => {
  it("engine and content have no React or browser dependencies", () => {
    for (const dir of ["engine", "content"]) {
      for (const f of files(join(SRC, dir))) {
        expect(importsOf(read(f)), f).not.toContain("react");
        expect(read(f), f).not.toMatch(/\bwindow\.|\bdocument\.|localStorage/);
      }
    }
  });

  it("scoring changes only through the reducer, never from network or animation callbacks", () => {
    // an assignment to a .score field, or a dispatch of a scoring action; comparisons (===) are fine
    const scoring = /ADJUST_SCORE|"AWARD"|\.score\s*[+-]?=(?!=)/;
    for (const f of [...files(join(SRC, "game")), ...files(join(SRC, "play")), ...files(join(SRC, "screen")), ...files(join(SRC, "ui"))]) {
      expect(read(f), f).not.toMatch(scoring);
    }
  });
});
