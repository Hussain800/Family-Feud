import { useEffect, useRef, useState } from "react";

/** Arm on the first click, act on the second. Wording, not colour, marks the dangerous ones. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = "bi-button bi-button--outline host__btn", disabled }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const t = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(t.current), []);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-live="polite"
      onClick={() => {
        if (armed) {
          window.clearTimeout(t.current);
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
          t.current = window.setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? `Confirm: ${confirmLabel}` : label}
    </button>
  );
}
