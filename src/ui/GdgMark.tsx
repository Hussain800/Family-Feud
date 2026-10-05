// The club's bracket mark in its four colours (kit/assets/logo-mark.svg in gdg-resources), drawn straight onto the
// surface. Its ink stroke is #111111 on light surfaces and flips to frost on the cobalt sheet, where black would vanish.
type Tone = "dark" | "light";
const INK: Record<Tone, string> = { dark: "#F3F8FF", light: "#111111" };
const strokes = (tone: Tone) => [
  { d: "M16 34 L46 15", c: "#FBBC04" },
  { d: "M16 34 L46 53", c: "#EA4335" },
  { d: "M78 15 L108 34", c: "#4285F4" },
  { d: "M78 53 L108 34", c: INK[tone] },
];

export function GdgMark({ size = 56, tone = "dark", label = "Google Developer Groups on Campus" }: { size?: number; tone?: Tone; label?: string }) {
  return (
    <svg className="gdg-mark" viewBox="0 0 124 68" width={size * 1.15} height={size * 0.63} role="img" aria-label={label}>
      <g fill="none" strokeLinecap="round" strokeWidth={15}>
        {strokes(tone).map((s) => <path key={s.d} d={s.d} stroke={s.c} />)}
      </g>
    </svg>
  );
}

/** One side of the code brackets, drawn as the mark's chevron so it keeps its two colours. */
export function Chevron({ side, height, tone = "dark" }: { side: "open" | "close"; height: number; tone?: Tone }) {
  const all = strokes(tone);
  const [a, b] = side === "open" ? all.slice(0, 2) : all.slice(2);
  return (
    <svg className="chevron" viewBox={side === "open" ? "6 4 50 60" : "68 4 50 60"} width={height * (50 / 60)} height={height} aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeWidth={13}>
        <path d={a.d} stroke={a.c} />
        <path d={b.d} stroke={b.c} />
      </g>
    </svg>
  );
}
