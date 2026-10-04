import { useEffect, useState } from "react";
import type { TeamId } from "../engine/types";
import { KEYS, readJson, writeJson } from "./persist";
import type { HostGame } from "./useHostGame";

/**
 * Physical buzzers that behave as a keyboard (the common USB kind) each send one key. We map one key per team.
 * `code` is the physical key (stable across layouts); `label` is only for display.
 */
export interface BuzzKey { code: string; label: string }
export type BuzzMap = Record<TeamId, BuzzKey>;

// Until the real buzzers are learned, Q and P let two people test the face-off on one keyboard.
export const DEFAULT_BUZZ_MAP: BuzzMap = { A: { code: "KeyQ", label: "Q" }, B: { code: "KeyP", label: "P" } };

const isKey = (v: unknown): v is BuzzKey => typeof v === "object" && v !== null && typeof (v as BuzzKey).code === "string" && typeof (v as BuzzKey).label === "string";

export function loadBuzzMap(): BuzzMap {
  const raw = readJson(KEYS.buzzers) as Partial<BuzzMap> | null;
  return raw && isKey(raw.A) && isKey(raw.B) && raw.A.code !== raw.B.code ? { A: raw.A, B: raw.B } : DEFAULT_BUZZ_MAP;
}

const labelOf = (e: KeyboardEvent) => (e.key === " " ? "SPACE" : e.key.length === 1 ? e.key.toUpperCase() : e.key);
const editable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

/** Keys that are also Play-tab shortcuts. A buzzer on one of them wins, so that shortcut stops working. */
export const clashesWithShortcut = (k: BuzzKey) => /^[0-9XU]$/.test(k.label);

export function useBuzzers(g: HostGame) {
  const [map, setMap] = useState<BuzzMap>(loadBuzzMap);
  const [learning, setLearning] = useState<TeamId | null>(null);
  const [error, setError] = useState("");
  /** The latest press of a mapped key, for the Setup test lamp. */
  const [last, setLast] = useState<{ team: TeamId; at: number } | null>(null);
  const [focused, setFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);

  useEffect(() => {
    const teamFor = (code: string): TeamId | null => (map.A.code === code ? "A" : map.B.code === code ? "B" : null);
    // Capture phase: a buzzer key never also acts as a shortcut, and a buzzer that sends Space or Enter never clicks a focused button.
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (learning) {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat || e.key === "Escape") return void setLearning(null);
        const other = learning === "A" ? "B" : "A";
        if (e.code === map[other].code) return void setError(`That button is already ${g.state.teams[other].name}'s buzzer. Press the other team's buzzer.`);
        const next = { ...map, [learning]: { code: e.code, label: labelOf(e) } };
        setMap(next);
        writeJson(KEYS.buzzers, next);
        setError("");
        setLearning(null);
        return;
      }
      const team = teamFor(e.code);
      if (!team || editable(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return; // a held button is one press
      setLast({ team, at: Date.now() });
      if (g.state.phase === "face_off") g.act({ type: "BUZZ", team });
    };
    const up = (e: KeyboardEvent) => {
      if ((teamFor(e.code) || learning) && !editable(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [map, learning, g]);

  const reset = () => {
    setMap(DEFAULT_BUZZ_MAP);
    writeJson(KEYS.buzzers, DEFAULT_BUZZ_MAP);
    setError("");
  };

  return { map, learning, setLearning: (t: TeamId | null) => { setError(""); setLearning(t); }, error, last, focused, reset };
}

export type Buzzers = ReturnType<typeof useBuzzers>;
