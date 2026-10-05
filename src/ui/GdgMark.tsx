// The club's bracket mark in its own four colours (kit/assets/logo-mark.svg in gdg-resources). Blue Ice allows the
// colour mark only small and on Frost, so every use sits on a frost plate.
const STROKES = [
  { d: "M16 34 L46 15", c: "#FBBC04" },
  { d: "M16 34 L46 53", c: "#EA4335" },
  { d: "M78 15 L108 34", c: "#4285F4" },
  { d: "M78 53 L108 34", c: "#111111" },
];

export function GdgMark({ size = 56, label = "Google Developer Groups on Campus" }: { size?: number; label?: string }) {
  return (
    <span className="gdg-plate" style={{ width: size * 1.5, height: size }}>
      <svg viewBox="0 0 124 68" width={size * 1.15} height={size * 0.63} role="img" aria-label={label}>
        <g fill="none" strokeLinecap="round" strokeWidth={15}>
          {STROKES.map((s) => <path key={s.d} d={s.d} stroke={s.c} />)}
        </g>
      </svg>
    </span>
  );
}

/** One side of the code brackets, drawn as the mark's chevron so it keeps its two colours. */
export function Chevron({ side, height }: { side: "open" | "close"; height: number }) {
  const [a, b] = side === "open" ? STROKES.slice(0, 2) : STROKES.slice(2);
  return (
    <svg className="chevron" viewBox={side === "open" ? "6 4 50 60" : "68 4 50 60"} width={height * (50 / 60)} height={height} aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeWidth={13}>
        <path d={a.d} stroke={a.c} />
        <path d={b.d} stroke={b.c} />
      </g>
    </svg>
  );
}
