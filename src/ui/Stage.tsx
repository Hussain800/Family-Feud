import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** A fixed 1920x1080 canvas scaled to fit its container. Other ratios letterbox instead of reflowing. */
export function Stage({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setScale(Math.min(r.width / STAGE_W, r.height / STAGE_H));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="stage-box">
      <div className="stage" style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
