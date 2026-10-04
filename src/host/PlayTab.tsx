import { useEffect, useRef, useState } from "react";
import { longLabels } from "../content/schema";
import type { Question } from "../content/types";
import { answering, otherTeam } from "../engine/reducer";
import type { GameState, TeamId } from "../engine/types";
import type { Buzzers } from "./buzzers";
import { PollControls } from "./PollControls";
import type { HostGame } from "./useHostGame";

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
      {armed ? `CONFIRM: ${confirmLabel}` : label}
    </button>
  );
}

const teamName = (s: GameState, t: TeamId) => s.teams[t].name;

function Teams({ g }: { g: HostGame }) {
  const s = g.state;
  const [names, setNames] = useState({ A: s.teams.A.name, B: s.teams.B.name });
  const lobby = s.phase === "lobby";
  return (
    <div className="panel">
      <h2 className="panel__h">Teams and scores</h2>
      <div className="teams">
        {(["A", "B"] as TeamId[]).map((t) => (
          <div key={t} className="teams__col">
            {lobby ? (
              <input
                aria-label={`Team ${t} name`}
                className="input"
                value={names[t]}
                maxLength={24}
                onChange={(e) => setNames({ ...names, [t]: e.target.value })}
                onBlur={() => g.act({ type: "SET_TEAM_NAMES", names })}
              />
            ) : (
              <p className="teams__name">{s.teams[t].name}</p>
            )}
            <p className="teams__score">{s.teams[t].score}</p>
            <div className="row row--tight" role="group" aria-label={`Correct ${s.teams[t].name} score`}>
              {[-5, -1, 1, 5].map((d) => (
                <button key={d} type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={() => g.act({ type: "ADJUST_SCORE", team: t, delta: d })}>
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="hint">Score corrections are separate from awards and can be undone.</p>
    </div>
  );
}

function Picker({ g }: { g: HostGame }) {
  const s = g.state;
  const [team, setTeam] = useState<TeamId>("A");
  const left = s.totalRounds - s.roundsPlayed;
  return (
    <div className="panel">
      <h2 className="panel__h">Choose a question · {s.tieBreakFrom != null && s.roundsPlayed >= s.tieBreakFrom ? "TIE-BREAK ROUND" : `round ${Math.min(s.roundsPlayed + 1, s.totalRounds)} of ${s.totalRounds}`}</h2>
      <div className="row">
        <fieldset className="seg">
          <legend className="bi-label">STARTING TEAM (ONLY IF YOU SKIP THE FACE-OFF)</legend>
          {(["A", "B"] as TeamId[]).map((t) => (
            <label key={t} className={`seg__opt ${team === t ? "is-on" : ""}`}>
              <input type="radio" name="start" checked={team === t} onChange={() => setTeam(t)} /> {teamName(s, t)}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="bi-label">ROUNDS IN MATCH</span>
          <input className="input input--sm" type="number" min={1} max={16} value={s.totalRounds} disabled={s.roundsPlayed > 0} onChange={(e) => g.act({ type: "NEW_MATCH", totalRounds: Math.max(1, Math.min(16, Number(e.target.value) || 3)) })} />
        </label>
      </div>
      {left <= 0 && <p className="hint">All rounds played. Finish the match.</p>}
      <ul className="qlist">
        {g.pack.questions.map((q) => (
          <QuestionRow key={q.id} g={g} q={q} team={team} played={s.playedQuestionIds.includes(q.id)} disabled={left <= 0} />
        ))}
      </ul>
      {s.roundsPlayed > 0 && <ConfirmButton label="Finish match now" confirmLabel="end the match" onConfirm={() => g.act({ type: "END_MATCH" })} />}
    </div>
  );
}

function QuestionRow({ g, q, team, played, disabled }: { g: HostGame; q: Question; team: TeamId; played: boolean; disabled: boolean }) {
  const ready = q.status === "ready";
  const long = longLabels(q);
  const start = () => g.startRound(q, team);
  return (
    <li className={`qrow ${ready ? "" : "qrow--pending"}`}>
      <span className="qrow__id">{q.id}</span>
      <span className="qrow__body">
        <span className="bi-label">{q.category.toUpperCase()}</span>
        <span className="qrow__q">{q.prompt}</span>
        {ready && long.length > 0 && <span className="warn">Long labels may wrap: {long.join(", ")}</span>}
      </span>
      <span className={`badge ${ready ? "badge--ready" : ""}`}>{played ? "PLAYED" : ready ? `READY · ${q.answers.length}` : "AWAITING SURVEY"}</span>
      {ready ? (
        long.length ? (
          <ConfirmButton label="Start round" confirmLabel="labels may wrap, start anyway" onConfirm={start} disabled={played || disabled} className="bi-button host__btn" />
        ) : (
          <button type="button" className="bi-button host__btn" disabled={played || disabled} onClick={start}>Start round</button>
        )
      ) : (
        <button type="button" className="bi-button bi-button--outline host__btn" aria-pressed={g.previewId === q.id} onClick={() => g.setPreviewId(g.previewId === q.id ? null : q.id)}>
          {g.previewId === q.id ? "Hide preview" : "Preview layout"}
        </button>
      )}
    </li>
  );
}

function Answers({ g }: { g: HostGame }) {
  const r = g.state.round!;
  const phase = g.state.phase;
  // In the face-off a reveal is the answer of whoever is up, so it needs a buzz first.
  const canReveal = phase === "face_off" ? answering(r.faceOff) !== null : phase === "team_turn" || phase === "steal" || phase === "round_over";
  const noPoints = phase === "round_over";
  return (
    <ol className="answers">
      {r.answers.map((a, i) => {
        const shown = r.revealed.includes(a.id);
        return (
          <li key={a.id} className={`answer ${shown ? "answer--shown" : ""}`}>
            <kbd className="answer__key">{i === 9 ? 0 : i + 1}</kbd>
            <span className="answer__text">{a.text}</span>
            <span className="answer__count">{a.count}</span>
            <span className="answer__alias">{a.aliases.length ? `also: ${a.aliases.join(", ")}` : ""}</span>
            <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" disabled={!canReveal || shown} onClick={() => g.act({ type: "REVEAL", answerId: a.id })}>
              {shown ? "Shown" : phase === "steal" ? "Steal hit" : noPoints ? "Show (no points)" : "Reveal"}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** What the host should do next in the face-off, in one sentence. */
function faceOffHint(s: GameState, r: NonNullable<GameState["round"]>): string {
  const fo = r.faceOff!;
  if (fo.winner) return `${teamName(s, fo.winner)} won the face-off.`;
  const turn = answering(fo);
  if (turn) {
    const second = fo.buzzed !== turn;
    return `${teamName(s, turn)} ${second ? "answers next" : "buzzed first"}. Click Reveal on the matching answer (or press its number), or Miss (X) if it is not on the board.`;
  }
  if (fo.tries.A && fo.tries.B) return "Both missed. Open the buzzers for the next two players.";
  return fo.armed ? "Buzzers are live. Waiting for the first buzz…" : "Read the question aloud. When a buzzer goes off, tap the team that was first.";
}

function FaceOffPanel({ g, b }: { g: HostGame; b: Buzzers }) {
  const s = g.state;
  const r = s.round!;
  const fo = r.faceOff!;
  const turn = answering(fo);
  const canOpen = !fo.winner && !fo.armed && (!fo.buzzed || (!!fo.tries.A && !!fo.tries.B) || Object.keys(fo.tries).length === 0);
  return (
    <div className="poll-host">
      <h3 className="panel__h">Face-off</h3>
      <p role="status"><b>{faceOffHint(s, r)}</b></p>
      <div className="row">
        {(["A", "B"] as TeamId[]).map((t) => (
          <button key={t} type="button" className="bi-button host__btn host__btn--award" disabled={!!fo.winner || Object.keys(fo.tries).length === 1} onClick={() => g.act({ type: "BUZZ", team: t, manual: true })}>
            {teamName(s, t)} buzzed first
          </button>
        ))}
        <button type="button" className="bi-button host__btn host__btn--strike" disabled={!turn} onClick={() => g.act({ type: "FACEOFF_MISS" })}>Miss: not on the board (X)</button>
        <ConfirmButton label="Skip face-off" confirmLabel={`${teamName(s, r.controllingTeam)} starts, no face-off`} onConfirm={() => g.act({ type: "BEGIN_PLAY" })} />
      </div>
      <p className="hint">
        Standalone buzzers (the club’s): when one goes off, tap the team that was first. Tapped the wrong team? Tap the right one before anyone answers.
        Revealing the player’s answer adds its points to the round pot, which goes to whichever team finally takes control.
      </p>
      <details>
        <summary className="hint">USB keyboard-style buzzers instead? (not needed for standalone buzzers)</summary>
        <div className="row">
          <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" disabled={!canOpen} onClick={() => g.act({ type: "FACEOFF_ARM" })}>Open buzzers (B)</button>
          <span className="hint">
            Keys: {teamName(s, "A")} = <kbd>{b.map.A.label}</kbd>, {teamName(s, "B")} = <kbd>{b.map.B.label}</kbd> (change them in the Session tab). The first press wins once the buzzers are open.
          </span>
        </div>
      </details>
      {fo.armed && !b.focused && <p className="warn" role="alert">This window is not focused: keyboard buzzers will not register. Click anywhere on it.</p>}
    </div>
  );
}

/** A countdown on the projector. It ends by itself, and ends when anything happens in the round. */
function TimerRow({ g }: { g: HostGame }) {
  return (
    <div className="row" role="group" aria-label="Countdown timer">
      <span className="bi-label">TIMER ON THE SCREEN</span>
      {[5, 10, 20, 30].map((n) => (
        <button key={n} type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={() => g.startTimer(n)}>{n} s</button>
      ))}
      <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" disabled={!g.timer} onClick={g.stopTimer}>Stop timer</button>
    </div>
  );
}

function Round({ g, b }: { g: HostGame; b: Buzzers }) {
  const s = g.state;
  const r = s.round!;
  const ctl = r.controllingTeam;
  const stealer = otherTeam(ctl);
  const inFaceOff = s.phase === "face_off" || s.phase === "play_or_pass";
  const undoBtn = (
    <button type="button" className="bi-button bi-button--outline host__btn" disabled={!g.canUndo} onClick={() => g.act({ type: "UNDO" })}>Undo last (U)</button>
  );
  const awardTo = r.stealResult === "success" ? stealer : ctl;
  const winner = r.faceOff?.winner ?? null;
  return (
    <div className="panel">
      <p className="bi-label">{r.category.toUpperCase()} · {s.phase.replace("_", " ").toUpperCase()}</p>
      <h2 className="round__q">{r.prompt}</h2>
      <p className="round__meta">Pot <b>{r.pot}</b> · {inFaceOff ? "Face-off: no strikes yet" : <>Strikes <b>{r.strikes}/3</b> · {s.phase === "steal" ? `${teamName(s, stealer)} steals` : `${teamName(s, ctl)} on the board`}</>}</p>

      <div className="row">
        {s.phase === "intro" && <button type="button" className="bi-button host__btn" onClick={() => g.act({ type: "SHOW_BOARD" })}>Show the board</button>}
        {s.phase === "board_ready" && <button type="button" className="bi-button host__btn" onClick={() => g.act({ type: "FACEOFF_START" })}>Start face-off (buzzers)</button>}
        {s.phase === "board_ready" && <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => g.act({ type: "BEGIN_PLAY" })}>Skip face-off, begin guessing</button>}
        {s.phase === "play_or_pass" && winner && (
          <>
            <button type="button" className="bi-button host__btn" onClick={() => g.act({ type: "PLAY_OR_PASS", choice: "play" })}>{teamName(s, winner)} PLAYS</button>
            <button type="button" className="bi-button host__btn" onClick={() => g.act({ type: "PLAY_OR_PASS", choice: "pass" })}>{teamName(s, winner)} PASSES to {teamName(s, otherTeam(winner))}</button>
            <span className="hint">Ask the winning player: play or pass?</span>
          </>
        )}
        {(s.phase === "intro" || s.phase === "board_ready") && (
          <>
            <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => g.act({ type: "SET_CONTROL", team: stealer })}>Switch start to {teamName(s, stealer)} (if skipping the face-off)</button>
            <ConfirmButton label="Back to questions" confirmLabel="drop this round" onConfirm={() => g.act({ type: "ABANDON_ROUND" })} />
          </>
        )}
        {s.phase === "team_turn" && (
          <>
            <button type="button" className="bi-button host__btn host__btn--strike" onClick={() => g.act({ type: "STRIKE" })}>Add strike (X)</button>
            <ConfirmButton label="End round early" confirmLabel="no more guesses" onConfirm={() => g.act({ type: "END_ROUND" })} />
          </>
        )}
        {s.phase === "steal" && (
          <>
            <button type="button" className="bi-button host__btn host__btn--strike" onClick={() => g.act({ type: "STRIKE" })}>Steal missed (X)</button>
            <span className="hint">{teamName(s, stealer)} gets one guess. A hit scores the answer and takes the pot.</span>
          </>
        )}
        {s.phase === "round_over" && !r.settlement && (
          <button type="button" className="bi-button host__btn host__btn--award" onClick={() => g.act({ type: "AWARD" })}>
            Award {r.pot} to {teamName(s, awardTo)}
          </button>
        )}
        {s.phase === "round_over" && r.settlement && (
          <>
            <span className="done">{r.settlement.amount} awarded to {teamName(s, r.settlement.winner)}.</span>
            <button type="button" className="bi-button host__btn" onClick={() => g.act({ type: "NEXT_ROUND" })}>{s.roundsPlayed + 1 >= s.totalRounds ? "Finish match" : "Next round"}</button>
          </>
        )}
        {undoBtn}
      </div>
      {(s.phase === "face_off" || s.phase === "team_turn" || s.phase === "steal") && <TimerRow g={g} />}
      {s.note && <p className="note" role="status">{s.note}</p>}
      {s.phase === "round_over" && r.settlement && <p className="hint">Revealing the rest is for discussion only. It never changes the pot or scores.</p>}
      <p className="hint">Undo restores the previous scores and pot. Answers already shown cannot become unknown to the audience.</p>

      {s.phase === "face_off" && r.faceOff && <FaceOffPanel g={g} b={b} />}
      {s.phase !== "intro" && s.phase !== "board_ready" && <Answers g={g} />}
      {s.phase === "team_turn" && <PollControls g={g} />}
    </div>
  );
}

function Over({ g }: { g: HostGame }) {
  const { A, B } = g.state.teams;
  return (
    <div className="panel">
      <h2 className="panel__h">Match over</h2>
      <p className="round__q">{A.score === B.score ? `Tie: ${A.score} each` : `${A.score > B.score ? A.name : B.name} wins, ${Math.max(A.score, B.score)} to ${Math.min(A.score, B.score)}`}</p>
      {A.score === B.score && <p className="hint">Level. Play one more round to settle it: it gets its own face-off, strikes and steal, and the projector calls it the tie-break.</p>}
      <div className="row">
        {A.score === B.score && <button type="button" className="bi-button host__btn host__btn--award" onClick={() => g.act({ type: "TIEBREAK" })}>Play a tie-break round</button>}
        <ConfirmButton label="Start a new match" confirmLabel="reset scores" onConfirm={() => g.act({ type: "NEW_MATCH" })} className={A.score === B.score ? "bi-button bi-button--outline host__btn" : "bi-button host__btn"} />
        {g.canUndo && <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => g.act({ type: "UNDO" })}>Undo last (U)</button>}
      </div>
    </div>
  );
}

export function PlayTab({ g, b }: { g: HostGame; b: Buzzers }) {
  const s = g.state;
  return (
    <div className="stack">
      {s.phase === "lobby" && <Picker g={g} />}
      {s.round && s.phase !== "lobby" && s.phase !== "match_over" && <Round g={g} b={b} />}
      {s.phase === "match_over" && <Over g={g} />}
      <Teams key={`${s.teams.A.name}|${s.teams.B.name}`} g={g} />
    </div>
  );
}
