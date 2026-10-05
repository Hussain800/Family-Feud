// The six colours a team can be named by (Rayyan, 5 Oct): "Team Red" ... "Team White". One small preset map, read by the
// rules, the public snapshot and every screen. A team's colour is explicit metadata on the game state, never guessed
// from its slot (A/B) or its name. Pure data: no React, no browser.

export const TEAM_COLORS = ["red", "blue", "yellow", "green", "black", "white"] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];

export interface TeamPreset {
  label: string;
  /** The identity colour, used on badges, tabs and borders only. */
  fill: string;
  /** Readable text on `fill`. */
  ink: string;
  /** An outline that keeps the colour visible against dark (projector) or light (console) surroundings, or null if it already is. */
  edgeOnDark: string | null;
  edgeOnLight: string | null;
}

const FROST = "#F3F8FF";
const NAVY = "#0A1B66";

export const TEAM_PRESETS: Record<TeamColor, TeamPreset> = {
  red: { label: "Red", fill: "#D93A2F", ink: "#FFFFFF", edgeOnDark: null, edgeOnLight: null },
  blue: { label: "Blue", fill: "#4EA1FF", ink: "#06123F", edgeOnDark: FROST, edgeOnLight: null },
  yellow: { label: "Yellow", fill: "#FBBC04", ink: "#06123F", edgeOnDark: null, edgeOnLight: NAVY },
  green: { label: "Green", fill: "#34A853", ink: "#06123F", edgeOnDark: null, edgeOnLight: null },
  black: { label: "Black", fill: "#111111", ink: FROST, edgeOnDark: FROST, edgeOnLight: null },
  white: { label: "White", fill: FROST, ink: "#06123F", edgeOnDark: null, edgeOnLight: NAVY },
};

export const isTeamColor = (v: unknown): v is TeamColor => typeof v === "string" && (TEAM_COLORS as readonly string[]).includes(v);

/** What a team is called once it has a colour: "Team Red". */
export const teamLabel = (c: TeamColor): string => `Team ${TEAM_PRESETS[c].label}`;
