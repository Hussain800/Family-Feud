import type { CSSProperties } from "react";
import { TEAM_PRESETS, isTeamColor } from "../teams";

/**
 * The one way a team colour reaches CSS: custom properties on the element, read by `.swatch`, the team tabs and the picker.
 * Both outlines are set; the stylesheet picks the one that suits the surface (dark projector, light console card, frost banner).
 * No colour (an old save, or not chosen yet) gives a neutral frost accent, so a team is never shown in a colour it was not given.
 */
export function teamStyle(color: string | null | undefined): CSSProperties {
  if (!isTeamColor(color)) return { "--tab": "rgba(243, 248, 255, 0.55)", "--tab-ink": "#06123F", "--tab-edge-dark": "transparent", "--tab-edge-light": "transparent" } as CSSProperties;
  const p = TEAM_PRESETS[color];
  return { "--tab": p.fill, "--tab-ink": p.ink, "--tab-edge-dark": p.edgeOnDark ?? "transparent", "--tab-edge-light": p.edgeOnLight ?? "transparent" } as CSSProperties;
}
