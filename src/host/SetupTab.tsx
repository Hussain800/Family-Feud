import { BuzzerSetup } from "./BuzzerPanel";
import { DataTab } from "./DataTab";
import { ConfirmButton } from "./ConfirmButton";
import { SessionTab } from "./SessionTab";
import { NextTeams, TeamIdentity } from "./TeamPicker";
import type { HostGame } from "./useHostGame";

function GameSetup({ g }: { g: HostGame }) {
  const s = g.state;
  return (
    <section className="card" aria-labelledby="game-h">
      <h2 className="card__h" id="game-h">Game</h2>
      <label className="field field--inline">
        <span className="field__label">Rounds per game</span>
        <input className="input input--num" type="number" min={1} max={16} value={s.totalRounds} disabled={s.roundsPlayed > 0 || s.round !== null} onChange={(e) => g.act({ type: "NEW_MATCH", totalRounds: Math.max(1, Math.min(16, Number(e.target.value) || 3)) })} />
        {s.roundsPlayed > 0 && <span className="muted small">Fixed once a game has started.</span>}
      </label>
      <h3 className="sub__h">Correct a team's colour</h3>
      <TeamIdentity g={g} scope="setup" />
      <p className="muted small">A correction only changes who is shown on the screens. Scores, the round and the buzzers are left exactly as they are.</p>
      <h3 className="sub__h">Next two teams</h3>
      <NextTeams g={g} scope="setup" />
      <div className="row">
        <ConfirmButton label="Restart with the same teams" confirmLabel="scores to 0" onConfirm={() => g.act({ type: "NEW_MATCH" })} className="bi-button host__btn host__btn--quiet" />
      </div>
      <p className="muted small">Both keep the questions and answers. Questions already played are marked so the next teams get fresh ones.</p>
    </section>
  );
}

function ProjectorSetup({ g }: { g: HostGame }) {
  const p = g.projector;
  return (
    <section className="card" aria-labelledby="projector-h">
      <h2 className="card__h" id="projector-h">Projector</h2>
      <p>
        {p === "closed" ? "The projector window is not open. Use Open projector, drag it to the audience display and make it fullscreen."
          : p === "off" ? "The projector is open but its sound is off. Click Enable sound in the projector window."
          : p === "muted" ? "The projector is open and muted."
          : "The projector is open and its sound is on."}
      </p>
      <div className="row">
        <button type="button" className="bi-button bi-button--outline host__btn" disabled={p !== "on"} onClick={g.testSound}>Play a test sound on the projector</button>
      </div>
    </section>
  );
}

export function SetupTab({ g }: { g: HostGame }) {
  return (
    <div className="setup">
      <GameSetup g={g} />
      <DataTab g={g} />
      <BuzzerSetup g={g} />
      <ProjectorSetup g={g} />
      <SessionTab g={g} />
    </div>
  );
}
