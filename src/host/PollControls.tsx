import { useState } from "react";
import { MAX_OPTIONS, MIN_OPTIONS } from "../poll/poll";
import { tally, useRemaining } from "../ui/poll-bits";
import { publicPoll } from "../poll/poll";
import type { HostGame } from "./useHostGame";

/** Crowd assist: suggestions typed by the host from what the room says aloud. Never from the answer bank. */
export function PollControls({ g }: { g: HostGame }) {
  const [cands, setCands] = useState(["", ""]);
  const [secs, setSecs] = useState(20);
  const [error, setError] = useState("");
  const view = g.poll && g.poll.status !== "cancelled" ? publicPoll(g.poll, Date.now()) : null;
  const remaining = useRemaining(view);
  const open = view?.status === "open";
  const t = view && view.status === "closed" ? tally(view) : null;

  const start = () => setError(g.startPoll(cands, secs * 1000) ?? "");

  return (
    <div className="poll-host">
      <h3 className="panel__h">Crowd assist (optional)</h3>
      <p className="hint">Type two to six guesses the room is shouting. Phones recommend one; the team decides. Votes never reveal an answer or score points.</p>

      {!view && (
        <>
          <div className="cands">
            {cands.map((c, i) => (
              <input
                key={i}
                className="input"
                aria-label={`Suggested guess ${i + 1}`}
                placeholder={`Guess ${i + 1}`}
                value={c}
                maxLength={40}
                onChange={(e) => setCands(cands.map((x, k) => (k === i ? e.target.value : x)))}
              />
            ))}
          </div>
          <div className="row">
            {cands.length < MAX_OPTIONS && <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={() => setCands([...cands, ""])}>Add guess</button>}
            {cands.length > MIN_OPTIONS && <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={() => setCands(cands.slice(0, -1))}>Remove last</button>}
            <label className="field field--inline">
              <span className="bi-label">SECONDS</span>
              <select className="input input--sm" value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
                {[10, 20, 30, 45].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" className="bi-button host__btn" disabled={!g.canPoll} onClick={start}>Open poll</button>
          </div>
          {!g.canPoll && <p className="hint">{g.room.status !== "ready" ? "Unavailable: the realtime relay is offline." : "Available during a live team turn."}</p>}
          {g.canPoll && g.room.connected === 0 && <p className="hint">No phones connected yet. Votes will be zero.</p>}
          {error && <p className="warn" role="alert">{error}</p>}
        </>
      )}

      {view && open && (
        <div className="poll-live" role="status">
          <p><b>{Math.ceil(remaining / 1000)}s</b> left · <b>{view.responses}</b> of {g.room.connected} connected phones have voted</p>
          <p className="hint">Totals stay hidden until the poll closes.</p>
          <button type="button" className="bi-button host__btn" onClick={g.endPoll}>Close poll now</button>
        </div>
      )}

      {view && !open && (
        <div className="poll-live" role="status">
          <ul className="poll-res">
            {view.options.map((o) => {
              const v = view.results?.find((r) => r.optionId === o.id)?.votes ?? 0;
              return (
                <li key={o.id} className={t?.top.includes(o.id) ? "is-top" : ""}>
                  <span>{o.label}</span>
                  <b>{v}</b>
                </li>
              );
            })}
          </ul>
          <p className="hint">{t!.total === 0 ? "No votes. Decide aloud." : t!.top.length > 1 ? "Tied. Decide aloud." : "Top suggestion highlighted. The team chooses whether to use it."}</p>
          <button type="button" className="bi-button bi-button--outline host__btn" onClick={g.clearPoll}>Clear poll and new suggestions</button>
        </div>
      )}
    </div>
  );
}
