import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface GuideStep {
  /** data-tour names to spotlight, first one on screen wins. None on screen: the popover shows its example instead. */
  targets: string[];
  title: string;
  body: ReactNode;
  /** A read-only picture of controls that only appear later in a round. Never wired to the game. */
  example?: ReactNode;
}

const GAP = 12;
const EDGE = 16;
const find = (names: string[]) => {
  for (const n of names) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${n}"]`);
    if (el && el.getClientRects().length) return el;
  }
  return null;
};

/**
 * A few small popovers over the real controls. Instructional only: it reads the page and never acts on the game.
 * The overlay swallows clicks and keys so nothing underneath fires while it is open.
 */
export function Guide({ phoneMode, onClose }: { phoneMode: boolean; onClose: (how: "done" | "skipped") => void }) {
  const [steps] = useState(() => guideSteps(phoneMode));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Find this step's control, bring it into view, and follow it on resize or scroll.
  useLayoutEffect(() => {
    find(step.targets)?.scrollIntoView({ block: "center", inline: "nearest" });
    const measure = () => setRect(find(step.targets)?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.targets]);

  // Below the control if it fits, else above, else centred; always inside the viewport.
  useLayoutEffect(() => {
    const el = pop.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) return setPos({ top: Math.max(EDGE, (vh - h) / 2), left: Math.max(EDGE, (vw - w) / 2) });
    let top = rect.bottom + GAP;
    if (top + h > vh - EDGE) top = rect.top - GAP - h;
    if (top < EDGE) top = Math.max(EDGE, Math.min(vh - h - EDGE, rect.top + rect.height / 2 - h / 2));
    const left = Math.max(EDGE, Math.min(vw - w - EDGE, rect.left + rect.width / 2 - w / 2));
    setPos({ top, left });
  }, [rect, i]);

  // Whatever had focus before the guide opened gets it back afterwards. Read once, before focus moves into the popover.
  const [before] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => next.current?.focus(), [i]);

  // The console re-renders every heartbeat; the latest onClose is read through a ref so the key handler is bound once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const close = useCallback((how: "done" | "skipped") => onCloseRef.current(how), []);

  // Keys stop here: Escape exits, Tab stays inside the popover, and the console shortcuts never see a key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close("skipped");
      } else if (e.key === "Tab" && pop.current) {
        const items = [...pop.current.querySelectorAll<HTMLElement>("button")];
        const at = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const back = before && document.contains(before) ? before : document.querySelector<HTMLElement>('[data-tour="guide"]');
      back?.focus();
    };
  }, [close, before]);

  return (
    <div className="guide" role="presentation">
      <div className={`guide__shade ${rect ? "" : "guide__shade--dim"}`} onClick={(e) => e.stopPropagation()} />
      {rect && <div className="guide__spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div ref={pop} className="guide__pop" role="dialog" aria-modal="true" aria-labelledby="guide-h" style={pos ?? { opacity: 0 }}>
        <p className="guide__count">Step {i + 1} of {steps.length}</p>
        <h2 className="guide__h" id="guide-h">{step.title}</h2>
        <div className="guide__body">{step.body}</div>
        {!rect && step.example && (
          <div className="guide__example" aria-label="Example only, not live controls">
            <p className="guide__example-label">Example</p>
            {step.example}
          </div>
        )}
        <div className="guide__nav">
          <button type="button" className="link-btn" onClick={() => close("skipped")}>Exit</button>
          <span className="guide__nav-right">
            {i > 0 && <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => setI(i - 1)}>Back</button>}
            <button ref={next} type="button" className="bi-button host__btn" onClick={() => (last ? close("done") : setI(i + 1))}>{last ? "Done" : "Next"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}

const Ex = ({ children, tone = "" }: { children: ReactNode; tone?: string }) => <span className={`guide__exbtn ${tone}`}>{children}</span>;

/** The five steps, worded with the console's exact labels. */
function guideSteps(phoneMode: boolean): GuideStep[] {
  return [
    {
      targets: ["projector"],
      title: "Your console and the audience screen",
      body: <p>This console is private: only you see the answers. <b>Open projector</b> opens the audience screen. Move it to the projector display, make it fullscreen, and click <b>Enable sound</b> there.</p>,
    },
    {
      targets: ["teams", "questions", "setup-tab"],
      title: "Prepare the game",
      body: (
        <p>
          Load the event pack once in <b>Setup</b>, under Survey results. Then choose each team&apos;s colour (Team Red, Team Blue, and so on) and press <b>Start</b> on a question. Setup also holds backups and the buzzer choice.{" "}
          {phoneMode ? "Phone buzzers are on: pair one phone per team in Setup, under Buzzers." : "Physical buzzers need no phones."}
        </p>
      ),
    },
    {
      targets: ["faceoff"],
      title: "Run the face-off",
      body: <p>A buzz only decides who answers first. Tap the team the hosts say buzzed first, reveal their answer or press <b>Wrong answer</b>, then record the hosts&apos; call and whether the winner <b>plays</b> or <b>passes</b>.</p>,
      example: (
        <div className="guide__exrow">
          <Ex>Team A buzzed first</Ex>
          <Ex>Team A wins the face-off</Ex>
          <Ex>Team A plays</Ex>
        </div>
      ),
    },
    {
      targets: ["answers"],
      title: "Reveal answers and fix mistakes",
      body: <p>When a spoken answer matches, press <b>Reveal</b> (or its number key): it flips over on the projector with a bell. A miss is <b>Wrong answer</b> (X): a big red X. <b>Undo</b> (U) takes back your last action.</p>,
      example: (
        <div className="guide__exrow">
          <Ex>Reveal</Ex>
          <Ex tone="is-red">Wrong answer X</Ex>
          <Ex tone="is-outline">Undo U</Ex>
        </div>
      ),
    },
    {
      targets: ["next", "adjust"],
      title: "Finish the round",
      body: <p>The box under the question always says what comes next: the steal, <b>Give points</b>, then <b>Next question</b>. After a game, choose the next two colours under <b>Next teams</b>. Use <b>Adjust score</b> for penalties and corrections.</p>,
    },
  ];
}
