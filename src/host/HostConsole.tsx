import { useEffect, useState } from "react";
import { isLocalOnly } from "../public/url";
import { ScreenView } from "../ui/ScreenView";
import { DataTab } from "./DataTab";
import { PlayTab } from "./PlayTab";
import { SessionTab } from "./SessionTab";
import { useHostGame, type HostGame } from "./useHostGame";

type Tab = "play" | "data" | "session";

/** Optional shortcuts: 1-9 and 0 reveal slots 1-10, X strike, U undo. Held keys and text fields are ignored. */
function useShortcuts(g: HostGame, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const { phase, round } = g.state;
      const k = e.key.toLowerCase();
      if (k === "u") return void (g.canUndo && g.act({ type: "UNDO" }));
      if (!round) return;
      if (k === "x" && (phase === "team_turn" || phase === "steal")) return void g.act({ type: "STRIKE" });
      if (/^[0-9]$/.test(k) && (phase === "team_turn" || phase === "steal" || phase === "round_over")) {
        const slot = k === "0" ? 10 : Number(k);
        const a = round.answers[slot - 1];
        if (a) g.act({ type: "REVEAL", answerId: a.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [g, enabled]);
}

export function HostConsole() {
  const g = useHostGame();
  const [tab, setTab] = useState<Tab>("play");
  useShortcuts(g, tab === "play" && !g.resumeOffer);
  const { room } = g;
  const localOnly = room.status === "ready" && isLocalOnly(room.joinUrl);
  const screenHref = `/screen/${room.code ?? "local"}`;

  return (
    <div className="host" data-theme="frost">
      <header className="host__head">
        <div>
          <p className="bi-label">GDG ON CAMPUS · UOBD · MODERATOR</p>
          <h1 className="host__title">hello, world! <span>&lt;FAMILY FEUD&gt;</span></h1>
        </div>
        <ul className="chips" aria-label="Status">
          <li className={`chip chip--${room.status}`}>RELAY {room.status === "ready" ? `ROOM ${room.code}` : room.status === "connecting" ? "CONNECTING" : "OFFLINE"}</li>
          <li className="chip">PHONES {room.connected}/{room.capacity}</li>
          <li className={`chip ${g.saveStatus && !g.saveStatus.ok ? "chip--bad" : ""}`}>
            {g.saveStatus?.ok ? `SAVED ${new Date(g.saveStatus.at).toLocaleTimeString()}` : g.saveStatus ? "NOT SAVED" : "…"}
          </li>
        </ul>
        <div className="host__open">
          <a className="bi-button bi-button--outline host__btn" href={screenHref} target="gdg-ff-screen" rel="noopener">Open projector</a>
          {room.joinUrl && <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => void navigator.clipboard?.writeText(room.joinUrl!)}>Copy join link</button>}
        </div>
      </header>

      {g.demo && <div className="demo-banner demo-banner--host" role="status">DEMO: INVENTED RESULTS · practice data, not survey results</div>}
      {g.saveStatus && !g.saveStatus.ok && (
        <div className="alert" role="alert"><b>UNSAVED.</b> Browser storage failed ({g.saveStatus.error}). The game continues in memory. Use Session → Export backup now.</div>
      )}
      {localOnly && (
        <div className="alert" role="alert"><b>PHONES CANNOT JOIN YET.</b> The join link points at localhost. Set <code>VITE_AIR_JAM_PUBLIC_HOST=http://&lt;laptop LAN IP&gt;:5173</code> in <code>.env.local</code> and restart.</div>
      )}
      {g.duplicate && (
        <div className="alert" role="alert"><b>ANOTHER MODERATOR WINDOW IS OPEN.</b> Two consoles in one browser overwrite each other&apos;s saved game. Close one of them.</div>
      )}
      {room.status === "offline" && (
        <div className="alert" role="status"><b>RELAY OFFLINE.</b> Crowd assist is off. Board, scoring and projector keep working.</div>
      )}
      {g.notice && (
        <div className="alert alert--notice" role="status">{g.notice} <button type="button" className="link" onClick={() => g.setNotice(null)}>Dismiss</button></div>
      )}

      {g.resumeOffer && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="resume-h">
          <div className="modal__card">
            <h2 id="resume-h">Resume the saved match?</h2>
            <p>
              Saved {new Date(g.resumeOffer.savedAt).toLocaleString()}: {g.resumeOffer.session.state.teams.A.name} {g.resumeOffer.session.state.teams.A.score},{" "}
              {g.resumeOffer.session.state.teams.B.name} {g.resumeOffer.session.state.teams.B.score}, {g.resumeOffer.session.state.roundsPlayed} round(s) played.
            </p>
            <p>Resuming restores the question, reveals, scores, strikes and any award already made. An unfinished poll is cancelled. Phones need the new room code if the room changed.</p>
            <div className="row">
              <button type="button" className="bi-button" onClick={g.resume}>Resume match</button>
              <button type="button" className="bi-button bi-button--outline" onClick={g.startFresh}>Start a new match</button>
            </div>
          </div>
        </div>
      )}

      <nav className="tabs" role="tablist">
        {(["play", "data", "session"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
            {t === "play" ? "Play" : t === "data" ? "Questions & data" : "Session"}
          </button>
        ))}
      </nav>

      <div className="host__body">
        <aside className="host__side" aria-label="Public screen preview">
          <p className="bi-label">PUBLIC SCREEN (WHAT THE ROOM SEES)</p>
          <div className="preview">{g.snapshot ? <ScreenView snapshot={g.snapshot} /> : null}</div>
        </aside>
        <section className="host__main">
          {tab === "play" && <PlayTab g={g} />}
          {tab === "data" && <DataTab g={g} />}
          {tab === "session" && <SessionTab g={g} />}
        </section>
      </div>
    </div>
  );
}
