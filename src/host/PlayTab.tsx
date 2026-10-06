import { useState, type ReactNode } from "react";
import { longLabels } from "../content/schema";
import { questionLabel, type Question } from "../content/types";
import { answering, faceOffCall, otherTeam } from "../engine/reducer";
import type { GameState, RoundState, TeamId } from "../engine/types";
import { ScreenView } from "../ui/ScreenView";
import { teamStyle } from "../ui/teamStyle";
import { PhoneFaceOff } from "./BuzzerPanel";
import { ConfirmButton } from "./ConfirmButton";
import { NextTeams, TeamIdentity, TeamTag } from "./TeamPicker";
import type { HostGame } from "./useHostGame";

const TEAMS: TeamId[] = ["A", "B"];
const name = (s: GameState, t: TeamId) => s.teams[t].name;
const isTieBreak = (s: GameState) => s.tieBreakFrom != null && s.roundsPlayed >= s.tieBreakFrom;
const roundLabel = (s: GameState) => (isTieBreak(s) ? "Tie-break round" : `Round ${Math.min(s.roundsPlayed + 1, s.totalRounds)} of ${s.totalRounds}`);

/** Which team is answering on the board right now, if any. */
function playing(s: GameState): { team: TeamId; label: string } | null {
  const r = s.round;
  if (!r) return null;
  if (s.phase === "team_turn") return { team: r.controllingTeam, label: "Playing" };
  if (s.phase === "steal") return { team: otherTeam(r.controllingTeam), label: "Stealing" };
  const turn = s.phase === "face_off" ? answering(r) : null;
  return turn ? { team: turn, label: "Answering" } : null;
}

// ---------- side column ------------------------------------------------------------------------

/** Scores stay in view while playing. Penalties and corrections live behind Adjust score. */
export function Scoreboard({ g }: { g: HostGame }) {
  const s = g.state;
  const r = s.round;
  const on = playing(s);
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<TeamId>("A");
  return (
    <section className="card score" aria-label="Scores">
      <div className="score__teams">
        {TEAMS.map((t) => (
          <div key={t} className={`score__team ${on?.team === t ? "is-on" : ""}`} style={teamStyle(s.teams[t].color)}>
            <span className="score__name" title={name(s, t)}><TeamTag name={name(s, t)} color={s.teams[t].color} /></span>
            <span className="score__num">{s.teams[t].score}</span>
            <span className="score__tag">{on?.team === t ? on.label : " "}</span>
          </div>
        ))}
      </div>
      {r && (
        <div className="score__round">
          <div>
            <span className="muted">Round points</span>
            <b className="score__pot">{r.pot}</b>
          </div>
          <div>
            <span className="muted">Strikes</span>
            <span className="strikes-mini" aria-label={`${r.strikes} of 3 strikes`}>
              {[1, 2, 3].map((n) => <i key={n} className={r.strikes >= n ? "is-on" : ""}>X</i>)}
            </span>
          </div>
        </div>
      )}
      <div data-tour="adjust">
        <button type="button" className="bi-button bi-button--outline host__btn host__btn--block" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Done adjusting" : "Adjust score"}
        </button>
        {open && (
          <div className="adjust">
            <div className="adjust__teams" role="group" aria-label="Team to adjust">
              {TEAMS.map((t) => (
                <button key={t} type="button" className="adjust__team" aria-pressed={team === t} onClick={() => setTeam(t)}><TeamTag name={name(s, t)} color={s.teams[t].color} /></button>
              ))}
            </div>
            <div className="adjust__amounts" role="group" aria-label={`Change ${name(s, team)} score`}>
              {[-10, -5, -1, 1, 5, 10].map((d) => (
                <button key={d} type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={() => g.act({ type: "ADJUST_SCORE", team, delta: d })}>
                  {d > 0 ? `+${d}` : `−${-d}`}
                </button>
              ))}
            </div>
            <p className="muted small">For penalties and corrections. Undo reverses an adjustment.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** A small copy of the audience screen. It never plays sound. */
export function AudiencePreview({ g }: { g: HostGame }) {
  return (
    <details className="card preview-card" open>
      <summary>Audience screen</summary>
      <div className="preview">{g.snapshot ? <ScreenView snapshot={g.snapshot} /> : null}</div>
    </details>
  );
}

// ---------- between rounds ---------------------------------------------------------------------

/** Before the first round: which two teams are playing. Later it is shown, not editable: corrections live in Setup. */
function Teams({ g }: { g: HostGame }) {
  const s = g.state;
  const { A, B } = s.teams;
  const pickable = s.roundsPlayed === 0;
  return (
    <section className="card" aria-label="Teams" data-tour="teams">
      <h2 className="card__h">Teams</h2>
      {pickable ? (
        <TeamIdentity g={g} scope="live" />
      ) : (
        <p className="names__fixed"><TeamTag name={A.name} color={A.color} /> <span className="muted">vs</span> <TeamTag name={B.name} color={B.color} /> <span className="muted small">Wrong colour? Correct it in Setup. Scores do not change.</span></p>
      )}
      {pickable && !(A.color && B.color) && <p className="step__hint">Choose both teams&apos; colours before round 1 so the projector shows them.</p>}
    </section>
  );
}

/** A browser with no event questions: say so plainly instead of listing questions that cannot be played. */
function NoQuestions({ onSetup }: { onSetup: () => void }) {
  return (
    <section className="card empty" aria-label="No questions loaded">
      <h2 className="card__h">No event questions on this laptop yet</h2>
      <p>Choose the Excel workbook with the answers (<code>family_feud_board.xlsx</code>) once, in Setup. It is read in this browser and never uploaded. Nothing is loaded automatically, and nothing has been invented.</p>
      <div className="row"><button type="button" className="bi-button host__btn host__btn--lg" onClick={onSetup}>Load the answers in Setup</button></div>
    </section>
  );
}

function QuestionRow({ g, q }: { g: HostGame; q: Question }) {
  const s = g.state;
  const ready = q.status === "ready";
  const played = s.playedQuestionIds.includes(q.id);
  const earlier = (s.usedEarlier ?? []).includes(q.id);
  const full = s.roundsPlayed >= s.totalRounds;
  const long = longLabels(q);
  const start = () => g.startRound(q, "A"); // who plays first is decided by the face-off
  return (
    <li className={`q ${ready && !played ? "" : "q--off"}`}>
      <span className="q__num">{questionLabel(q.id)}</span>
      <span className="q__text">
        {q.prompt}
        {ready && long.length > 0 && <span className="q__warn">Long answers may wrap on the board: {long.join(", ")}</span>}
      </span>
      <span className="q__tags">
        {played ? <span className="tag">Played</span> : earlier ? <span className="tag">Used in an earlier game</span> : !ready ? <span className="tag tag--quiet">No results yet</span> : null}
      </span>
      {ready ? (
        long.length ? (
          <ConfirmButton label="Start" confirmLabel="start anyway" onConfirm={start} disabled={played || full} className="bi-button host__btn" />
        ) : (
          <button type="button" className="bi-button host__btn" disabled={played || full} onClick={start}>Start</button>
        )
      ) : (
        <button type="button" className="bi-button bi-button--outline host__btn" aria-pressed={g.previewId === q.id} onClick={() => g.setPreviewId(g.previewId === q.id ? null : q.id)}>
          {g.previewId === q.id ? "Hide preview" : "Preview"}
        </button>
      )}
    </li>
  );
}

function Lobby({ g, onSetup }: { g: HostGame; onSetup: () => void }) {
  const s = g.state;
  const { A, B } = s.teams;
  if (!g.pack.questions.some((q) => q.status === "ready")) return <NoQuestions onSetup={onSetup} />;
  return (
    <>
      <Teams g={g} />
      <section className="card" data-tour="questions" aria-label="Questions">
        <div className="card__bar">
          <h2 className="card__h">{roundLabel(s)}: choose a question</h2>
          {s.roundsPlayed > 0 && <span className="muted">{A.name} {A.score} · {B.name} {B.score}</span>}
        </div>
        <ul className="qlist">
          {g.pack.questions.map((q) => <QuestionRow key={q.id} g={g} q={q} />)}
        </ul>
        {s.roundsPlayed > 0 && (
          <div className="row">
            <ConfirmButton label="Finish the game now" confirmLabel="end this game" onConfirm={() => g.act({ type: "END_MATCH" })} className="bi-button host__btn host__btn--quiet" />
          </div>
        )}
      </section>
    </>
  );
}

// ---------- during a round ---------------------------------------------------------------------

function Answers({ g }: { g: HostGame }) {
  const r = g.state.round!;
  const phase = g.state.phase;
  // In the face-off a reveal is the answer of whoever is up, so it needs a buzz first.
  const canReveal = phase === "face_off" ? answering(r) !== null : phase === "team_turn" || phase === "steal" || phase === "round_over";
  const label = phase === "round_over" ? "Show" : "Reveal";
  return (
    <ol className={`answers ${r.answers.length > 6 ? "answers--two" : ""}`} data-tour="answers" aria-label="Answers (private)">
      {r.answers.map((a, i) => {
        const shown = r.revealed.includes(a.id);
        return (
          <li key={a.id} className={`answer ${shown ? "answer--shown" : ""}`}>
            <kbd className="answer__key" aria-label={`Key ${i === 9 ? 0 : i + 1}`}>{i === 9 ? 0 : i + 1}</kbd>
            <span className="answer__main">
              <span className="answer__text">{a.text}</span>
              {a.aliases.length > 0 && <span className="answer__alias">Also: {a.aliases.join(", ")}</span>}
              {a.notes && <details className="answer__notes"><summary>Counted as</summary><p>{a.notes}</p></details>}
            </span>
            <span className="answer__count" aria-label={a.votes != null ? `${a.count} points, ${a.votes} votes` : `${a.count} points`}>{a.count}{a.votes != null && <small>{a.votes} {a.votes === 1 ? "vote" : "votes"}</small>}</span>
            {shown ? (
              <span className="answer__on">On board</span>
            ) : (
              <button type="button" className="bi-button host__btn answer__btn" disabled={!canReveal} onClick={() => g.act({ type: "REVEAL", answerId: a.id })}>
                {label}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function why(s: GameState, r: RoundState, team: TeamId): string {
  const fo = r.faceOff!;
  const a = fo.tries[fo.buzzed!];
  const b = fo.tries[otherTeam(fo.buzzed!)];
  if (!b) return `${name(s, team)} found the top answer`;
  if (!a?.hit || !b.hit) return `${name(s, team)} has the only answer on the board`;
  if (a.count === b.count) return "same points, so it goes to the first buzzer";
  return `${name(s, team)}'s answer scores higher`;
}

/** The face-off, step by step: who buzzed, their answer, then the hosts' call. */
function FaceOff({ g }: { g: HostGame }) {
  const s = g.state;
  const r = s.round!;
  const fo = r.faceOff!;
  const turn = answering(r);
  const call = faceOffCall(r);
  const tries = Object.values(fo.tries);
  const waiting = !turn && call === null && !tries.some((t) => t?.hit);
  const second = turn !== null && fo.buzzed !== turn;
  return (
    <div className="step" data-tour="faceoff">
      <p className="step__label">Face-off</p>
      {waiting && (
        <>
          <p className="step__text">
            {tries.length === 2 ? "Both missed. Bring up the next two players. " : ""}
            {g.buzzerMode === "phone" ? "Open the phone buzzers. The first press counts; or tap the team the hosts name." : "Who buzzed first? Tap the team the hosts name."}
          </p>
          {g.buzzerMode === "phone" && <PhoneFaceOff g={g} />}
          <div className="row">
            {TEAMS.map((t) => (
              <button key={t} type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "BUZZ", team: t })}>{name(s, t)} buzzed first</button>
            ))}
          </div>
        </>
      )}
      {turn && (
        <>
          <p className="step__text"><b>{name(s, turn)}</b> {second ? "answers next" : "buzzed first and answers"}. Reveal their answer below, or press Wrong answer.</p>
          {!second && tries.length === 0 && g.buzzerMode === "phone" && <PhoneFaceOff g={g} />}
          {!second && tries.length === 0 && (
            <button type="button" className="link-btn" onClick={() => g.act({ type: "BUZZ", team: otherTeam(turn) })}>Wrong team? It was {name(s, otherTeam(turn))}</button>
          )}
        </>
      )}
      {!waiting && !turn && (
        <>
          <p className="step__text">Over to the hosts: who won the face-off?</p>
          {call && <p className="step__hint">By the survey, {name(s, call)} wins: {why(s, r, call)}.</p>}
          <div className="row">
            {TEAMS.map((t) => (
              <button key={t} type="button" className={`bi-button host__btn host__btn--lg ${call && call !== t ? "bi-button--outline" : ""}`} onClick={() => g.act({ type: "FACEOFF_WIN", team: t })}>{name(s, t)} wins the face-off</button>
            ))}
          </div>
        </>
      )}
      {(waiting || turn) && (
        <p className="step__quiet">
          Hosts already decided?{" "}
          {TEAMS.map((t) => (
            <button key={t} type="button" className="link-btn" onClick={() => g.act({ type: "FACEOFF_WIN", team: t })}>{name(s, t)} won</button>
          ))}
        </p>
      )}
    </div>
  );
}

/** One sentence on what happens now, with the buttons for it. */
function NextStep({ g }: { g: HostGame }) {
  const s = g.state;
  const r = s.round!;
  const ctl = r.controllingTeam;
  const stealer = otherTeam(ctl);
  const [skipping, setSkipping] = useState(false);
  const award = r.stealResult === "success" ? stealer : ctl;

  if (s.phase === "face_off") return <FaceOff g={g} />;
  let text: ReactNode = null;
  let actions: ReactNode = null;
  switch (s.phase) {
    case "intro":
      text = "The hosts read the question to the room.";
      actions = <button type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "SHOW_BOARD" })}>Show the board</button>;
      break;
    case "board_ready":
      text = skipping ? "No face-off. Who plays first?" : "Bring one player from each team to the buzzers, then start the face-off.";
      actions = skipping ? (
        <>
          {TEAMS.map((t) => (
            <button key={t} type="button" className="bi-button host__btn host__btn--lg" onClick={() => { g.act({ type: "SET_CONTROL", team: t }); g.act({ type: "BEGIN_PLAY" }); }}>{name(s, t)} plays first</button>
          ))}
          <button type="button" className="link-btn" onClick={() => setSkipping(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "FACEOFF_START" })}>Start the face-off</button>
          <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => setSkipping(true)}>Skip the face-off</button>
        </>
      );
      break;
    case "play_or_pass": {
      const w = r.faceOff!.winner!;
      text = <><b>{name(s, w)}</b> won the face-off. Ask them: play or pass?</>;
      actions = (
        <>
          <button type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "PLAY_OR_PASS", choice: "play" })}>{name(s, w)} plays</button>
          <button type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "PLAY_OR_PASS", choice: "pass" })}>{name(s, w)} passes</button>
          <button type="button" className="link-btn" onClick={() => g.act({ type: "FACEOFF_WIN", team: otherTeam(w) })}>Wrong call? {name(s, otherTeam(w))} won</button>
        </>
      );
      break;
    }
    case "team_turn":
      text = <><b>{name(s, ctl)}</b> is playing. Reveal each right answer; press Wrong answer for a miss. Three wrong answers open the steal.</>;
      break;
    case "steal":
      text = <><b>{name(s, stealer)}</b> can steal with one guess. Reveal it if it is on the board, otherwise press Wrong answer.</>;
      break;
    case "round_over":
      if (!r.settlement) {
        text = r.stealResult === "success" ? <><b>{name(s, stealer)}</b> stole the round.</> : r.stealResult === "fail" ? <>Steal missed. <b>{name(s, ctl)}</b> keeps the points.</> : r.cleared ? "The board is cleared." : "The round has ended.";
        actions = <button type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "AWARD" })}>Give {r.pot} points to {name(s, award)}</button>;
      } else {
        text = <>{r.settlement.amount} points to <b>{name(s, r.settlement.winner)}</b>. Showing the rest of the answers is for fun; it never changes scores.</>;
        actions = <button type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "NEXT_ROUND" })}>{s.roundsPlayed + 1 >= s.totalRounds ? "Finish the game" : "Next question"}</button>;
      }
      break;
  }
  return (
    <div className="step" data-tour="next">
      <p className="step__text">{text}</p>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/** A countdown on the projector. It ends by itself, and ends when anything happens in the round. */
function TimerGroup({ g }: { g: HostGame }) {
  return (
    <span className="timer" role="group" aria-label="Countdown timer on the projector">
      <span className="muted">Timer</span>
      {[5, 10, 20, 30].map((n) => (
        <button key={n} type="button" className="link-btn" onClick={() => g.startTimer(n)}>{n}s</button>
      ))}
      {g.timer && <button type="button" className="link-btn" onClick={g.stopTimer}>Stop</button>}
    </span>
  );
}

function Round({ g }: { g: HostGame }) {
  const s = g.state;
  const r = s.round!;
  const wrongOk = (s.phase === "face_off" && answering(r) !== null) || s.phase === "team_turn" || s.phase === "steal";
  const live = s.phase === "face_off" || s.phase === "team_turn" || s.phase === "steal";
  return (
    <section className="round" aria-label="Current round">
      <p className="round__meta">{questionLabel(r.questionId)} · {roundLabel(s)}</p>
      <h2 className="round__q">{r.prompt}</h2>
      <NextStep key={s.phase} g={g} />
      {s.note && <p className="note" role="status">{s.note}</p>}
      <Answers g={g} />
      <div className="actionbar">
        <button
          type="button"
          className="bi-button host__btn host__btn--danger host__btn--lg"
          data-tour="wrong"
          disabled={!wrongOk}
          title={s.phase === "face_off" ? "A face-off miss is not a strike" : undefined}
          onClick={() => g.act(s.phase === "face_off" ? { type: "FACEOFF_MISS" } : { type: "STRIKE" })}
        >
          Wrong answer <kbd>X</kbd>
        </button>
        <button type="button" className="bi-button bi-button--outline host__btn host__btn--lg" data-tour="undo" disabled={!g.canUndo} onClick={() => g.act({ type: "UNDO" })}>
          Undo <kbd>U</kbd>
        </button>
        <span className="actionbar__more">
          {live && <TimerGroup g={g} />}
          {s.phase === "team_turn" && <ConfirmButton label="End round early" confirmLabel="no more guesses" onConfirm={() => g.act({ type: "END_ROUND" })} className="link-btn" />}
          {(s.phase === "intro" || s.phase === "board_ready") && <ConfirmButton label="Back to questions" confirmLabel="drop this round" onConfirm={() => g.act({ type: "ABANDON_ROUND" })} className="link-btn" />}
        </span>
      </div>
    </section>
  );
}

function Over({ g }: { g: HostGame }) {
  const { A, B } = g.state.teams;
  const tie = A.score === B.score;
  return (
    <section className="card over" data-tour="next">
      <p className="round__meta">Game over</p>
      <h2 className="round__q">{tie ? `It's a tie: ${A.score} each` : `${A.score > B.score ? A.name : B.name} wins, ${Math.max(A.score, B.score)} to ${Math.min(A.score, B.score)}`}</h2>
      {tie && <p>Play one more round to settle it. It gets its own face-off, strikes and steal.</p>}
      <div className="row">
        {tie && <button type="button" className="bi-button host__btn host__btn--lg" onClick={() => g.act({ type: "TIEBREAK" })}>Play a tie-break round</button>}
        {g.canUndo && <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => g.act({ type: "UNDO" })}>Undo <kbd>U</kbd></button>}
      </div>
      <h3 className="sub__h">Next teams</h3>
      <NextTeams g={g} scope="over" outline={tie} />
      <p className="muted small">The next teams keep the same questions. Ones already played are marked so you can pick fresh ones.</p>
    </section>
  );
}

export function LiveTab({ g, onSetup }: { g: HostGame; onSetup: () => void }) {
  const s = g.state;
  return (
    <div className="live">
      <div className="live__main">
        {s.phase === "lobby" && <Lobby g={g} onSetup={onSetup} />}
        {s.round && s.phase !== "lobby" && s.phase !== "match_over" && <Round g={g} />}
        {s.phase === "match_over" && <Over g={g} />}
      </div>
      <aside className="live__side" aria-label="Scores and audience screen">
        <Scoreboard g={g} />
        <AudiencePreview g={g} />
      </aside>
    </div>
  );
}
