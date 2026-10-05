import { teamStyle } from "./teamStyle";

/** A small colour badge. Always sits beside the written team name: colour is never the only signal. */
export function Swatch({ color }: { color: string | null | undefined }) {
  return <i className="swatch" style={teamStyle(color)} aria-hidden="true" />;
}
