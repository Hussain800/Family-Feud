import { useState } from "react";
import { ConfirmButton } from "./PlayTab";
import { download, makeBackup, parseBackup } from "./persist";
import type { HostGame } from "./useHostGame";

/** Setup: backups and what to do when something goes wrong. */
export function SessionTab({ g }: { g: HostGame }) {
  const [restore, setRestore] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [done, setDone] = useState("");
  return (
    <section className="card" aria-labelledby="backup-h">
      <h2 className="card__h" id="backup-h">Backup and recovery</h2>
      <p className="muted">Progress and answers save in this browser after every action. That is a copy on this laptop, not in the cloud. Export a private backup before the event and keep it off the public repository.</p>
      <div className="row">
        <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => download(`feud-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.session-backup.json`, makeBackup(g.pack, g.session))}>Export private backup</button>
      </div>

      <details className="more">
        <summary>Restore from a backup file</summary>
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
              confirmLabel="replace current game and answers"
              onConfirm={() => {
                g.restoreSession(restore.session, restore.pack);
                setRestore(null);
                setDone("Backup restored.");
              }}
            />
          </div>
        )}
        {done && <div className="alert alert--notice" role="status">{done}</div>}
      </details>

      <details className="more">
        <summary>If something goes wrong</summary>
        <ul className="plain">
          <li><b>Wrong click:</b> Undo (U). An answer the room has seen cannot be hidden again.</li>
          <li><b>Projector window reloads:</b> it asks this window for the latest board. Nothing is scored twice.</li>
          <li><b>This window refreshes:</b> you are offered Resume.</li>
          <li><b>No internet:</b> physical-buzzer mode needs none. The board, scores and projector run on this laptop.</li>
          <li><b>Phone buzzer drops (phone mode):</b> the hosts judge that face-off and you tap the team.</li>
        </ul>
        <p className="muted small">Shortcuts on the Live screen: 1 to 9 and 0 reveal answers 1 to 10, X wrong answer, U undo.</p>
      </details>
    </section>
  );
}
