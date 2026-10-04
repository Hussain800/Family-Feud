// Wraps the club's own BlueIce.Wordmark (src/styles/blue-ice-club.js) so the fracture is the
// official one. The crack layer fades in once; reduced motion and quiet mode show it immediately.
import { useEffect, useRef } from "react";
import "../styles/blue-ice-club.js";

interface BlueIceGlobal {
  Wordmark: (o: { width: number; lines?: string[]; stretch?: number; seed?: number }) => SVGSVGElement;
}
declare global {
  interface Window {
    BlueIce?: BlueIceGlobal;
  }
}

export function Wordmark({ width = 900, lines }: { width?: number; lines?: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    // The wordmark measures real glyphs, so wait for Archivo.
    void document.fonts.load("900 100px Archivo").then(() => {
      if (cancelled || !el || !window.BlueIce) return;
      const svg = window.BlueIce.Wordmark({ width, ...(lines ? { lines } : {}) });
      const groups = svg.querySelectorAll(":scope > g");
      groups[groups.length - 1]?.classList.add("crack-in");
      el.replaceChildren(svg);
    });
    return () => {
      cancelled = true;
      el?.replaceChildren();
    };
  }, [width, lines]);
  return <div ref={host} className="wordmark-host" style={{ width, minHeight: width * 0.5 }} role="presentation" />;
}
