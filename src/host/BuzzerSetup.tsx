import { useEffect, useState } from "react";
import type { TeamId } from "../engine/types";
import { clashesWithShortcut, type Buzzers } from "./buzzers";
import type { HostGame } from "./useHostGame";

/** Learn each team's buzzer by pressing it, and test it. Safe to use any time: presses outside a face-off do nothing. */
export function BuzzerSetup({ g, b }: { g: HostGame; b: Buzzers }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const lit = (team: TeamId) => b.last?.team === team && now - b.last.at < 1500;
  return (
    <div className="panel">
      <h2 className="panel__h">Buzzers</h2>
      <p className="hint">Plug the buzzers in, click a team’s Learn button, then press that team’s buzzer. If both buzzers share one key, or yours has no USB cable (the wireless kind with a light), use the Team buttons in the face-off panel instead. Press a buzzer any time to test it: its lamp lights here.</p>
      <div className="buzz-grid">
        {(["A", "B"] as TeamId[]).map((t) => (
          <div key={t} className={`buzz ${lit(t) ? "buzz--lit" : ""}`}>
            <p className="buzz__name">{g.state.teams[t].name}</p>
            <p className="buzz__key">{b.learning === t ? "PRESS THE BUZZER…" : <>KEY <kbd>{b.map[t].label}</kbd></>}</p>
            <p className="buzz__lamp" role="status">{lit(t) ? "BUZZ DETECTED" : "waiting"}</p>
            <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={() => b.setLearning(b.learning === t ? null : t)}>
              {b.learning === t ? "Cancel" : "Learn"}
            </button>
            {clashesWithShortcut(b.map[t]) && <p className="hint">This key is also a Play-tab shortcut; the buzzer takes priority. Use the Reveal buttons for that slot.</p>}
          </div>
        ))}
      </div>
      {b.error && <p className="warn" role="alert">{b.error}</p>}
      <div className="row">
        <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={b.reset}>Back to Q and P</button>
        {!b.focused && <span className="warn" role="status">This window is not focused: keyboard buzzers will not register. Click it.</span>}
      </div>
    </div>
  );
}
