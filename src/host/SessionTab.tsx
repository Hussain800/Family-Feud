import { useState } from "react";
import type { Buzzers } from "./buzzers";
import { BuzzerSetup } from "./BuzzerSetup";
import { ConfirmButton } from "./PlayTab";
import { download, makeBackup, parseBackup } from "./persist";
import type { HostGame } from "./useHostGame";

export function SessionTab({ g, b }: { g: HostGame; b: Buzzers }) {
  const [restore, setRestore] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [done, setDone] = useState("");
  return (
    <div className="stack">
      <BuzzerSetup g={g} b={b} />

      <div className="panel">
        <h2 className="panel__h">Saving and backup</h2>
        <p>{g.saveStatus?.ok ? `Saved in this browser at ${new Date(g.saveStatus.at).toLocaleTimeString()}.` : g.saveStatus ? `NOT SAVED: ${g.saveStatus.error}` : "Saving…"}</p>
        <p className="hint">Progress and the answer pack save in this browser after every host action. That is a local copy, not a cloud backup. Export a private backup before the event and keep it off the public repository.</p>
        <div className="row">
          <button type="button" className="bi-button host__btn" onClick={() => download(`feud-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.session-backup.json`, makeBackup(g.pack, g.session))}>Export private backup</button>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel__h">Restore from a backup file</h2>
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Choose backup file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setDone("");
            if (f) setRestore(parseBackup(await f.text()));
            e.target.value = "";
          }}
        />
        {restore && !restore.ok && (
          <div className="alert" role="alert"><b>Backup rejected. Your current game is untouched.</b><ul>{restore.errors.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        )}
        {restore?.ok && (
          <div className="row">
            <p>Valid backup: {restore.session.state.teams.A.name} {restore.session.state.teams.A.score} · {restore.session.state.teams.B.name} {restore.session.state.teams.B.score}.</p>
            <ConfirmButton
              label="Restore this backup"
              confirmLabel="replace current game and pack"
              onConfirm={() => {
                g.restoreSession(restore.session, restore.pack);
                setRestore(null);
                setDone("Backup restored. Open a new poll if one was running.");
              }}
            />
          </div>
        )}
        {done && <div className="alert alert--notice" role="status">{done}</div>}
      </div>

      <div className="panel">
        <h2 className="panel__h">Match</h2>
        <div className="row">
          <ConfirmButton label="Start a new match" confirmLabel="reset both scores" onConfirm={() => g.act({ type: "NEW_MATCH" })} />
        </div>
        <p className="hint">New match keeps the team names and the pack, and resets scores and played questions.</p>
      </div>

      <div className="panel">
        <h2 className="panel__h">If something goes wrong</h2>
        <ul className="plain">
          <li><b>Phone drops:</b> it shows “Reconnecting”. The board and scoring carry on; it recovers its vote status if the poll is still open.</li>
          <li><b>Relay down:</b> crowd assist turns off. Reveals, scoring and the projector keep working.</li>
          <li><b>Projector window reloads:</b> it asks this window for the latest board. Scores are not re-awarded.</li>
          <li><b>This window refreshes:</b> you are offered Resume. Any unfinished poll is cancelled. If the room code changed, show the new QR.</li>
          <li><b>Misclick:</b> Undo (U). A shown answer cannot become unknown to the audience.</li>
        </ul>
        <p className="hint">Shortcuts on the Play tab: 1–9 and 0 reveal slots 1–10, X strike (or miss in a face-off), B open buzzers, U undo. Held keys and text fields are ignored.</p>
      </div>
    </div>
  );
}
