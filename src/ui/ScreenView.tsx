import { RoomQrCode } from "@air-jam/sdk/ui";
import type { TeamId } from "../engine/types";
import type { PublicFaceOff, PublicPoll, PublicSlot, PublicSnapshot } from "../public/types";
import { faceOffTurn } from "../public/faceoff";
import { hostOf, isLocalOnly } from "../public/url";
import { tally, useNow, useRemaining } from "./poll-bits";
import { Stage } from "./Stage";
import { Wordmark } from "./Wordmark";

const QR_FG = "#0A1B66";
const QR_BG = "#F3F8FF";


const GdgMark = () => <img className="gdg-mark" src="/brand/gdg-mark-frost.svg" alt="" width={64} height={32} />;

function Timer({ t }: { t: NonNullable<PublicSnapshot["timer"]> }) {
  const left = Math.max(0, t.endsAt - useNow(true));
  const secs = Math.ceil(left / 1000);
  return (
    <div className={`s-timer ${left === 0 ? "s-timer--up" : secs <= 3 ? "s-timer--low" : ""}`} role="timer" aria-label={left === 0 ? "Time is up" : `${secs} seconds left`}>
      <span className="s-timer__n">{left === 0 ? "TIME" : secs}</span>
      <span className="s-timer__bar"><i style={{ width: `${t.durationMs ? (left / t.durationMs) * 100 : 0}%` }} /></span>
    </div>
  );
}

function Header({ s, qr }: { s: PublicSnapshot; qr: boolean }) {
  const canJoin = qr && s.room.status === "ready" && s.room.joinUrl && !isLocalOnly(s.room.joinUrl);
  return (
    <header className="s-head">
      <div className="s-head__left">
        <p className="bi-label">GDG ON CAMPUS · UOBD</p>
        <p className="s-head__title">hello, world! <span>&lt;FAMILY FEUD&gt;</span></p>
      </div>
      <div className="s-head__mid">
        {s.round && s.round.number > 0 && s.phase !== "intro" && (
          <>
            <p className="bi-label">{s.round.category.toUpperCase()}</p>
            {s.timer ? <Timer t={s.timer} /> : <p className="s-head__round">{s.progress.tieBreak ? "TIE-BREAK" : `ROUND ${s.round.number} OF ${s.round.total}`}</p>}
          </>
        )}
      </div>
      <div className="s-head__right">
        {canJoin && (
          <div className="s-join">
            <div className="s-join__text">
              <p className="bi-label">JOIN ON YOUR PHONE</p>
              <p className="s-join__code">{s.room.code}</p>
              <p className="s-join__url">{hostOf(s.room.joinUrl)}/join</p>
            </div>
            <RoomQrCode value={s.room.joinUrl!} size={124} padding={1} foregroundColor={QR_FG} backgroundColor={QR_BG} errorCorrectionLevel="M" alt="Join QR code" />
          </div>
        )}
        <GdgMark />
      </div>
    </header>
  );
}

function DemoBanner({ label }: { label: string | null }) {
  return label ? <div className="demo-banner" role="status">{label}</div> : null;
}

function Lobby({ s }: { s: PublicSnapshot }) {
  const r = s.room;
  const localOnly = isLocalOnly(r.joinUrl);
  return (
    <div className="lobby">
      <div className="lobby__left">
        <p className="bi-label">GDG ON CAMPUS · UNIVERSITY OF BIRMINGHAM DUBAI</p>
        <Wordmark width={860} />
        <p className="lobby__display">&lt;FAMILY FEUD&gt;</p>
        <p className="lobby__teams">{s.teams[0].name} <i>vs</i> {s.teams[1].name}</p>
      </div>
      <div className="lobby__right">
        {r.status === "ready" && r.joinUrl && !localOnly ? (
          <>
            <RoomQrCode value={r.joinUrl} size={400} padding={1} foregroundColor={QR_FG} backgroundColor={QR_BG} errorCorrectionLevel="M" alt="Join QR code" />
            <p className="bi-label">ROOM CODE</p>
            <p className="lobby__code">{r.code}</p>
            <p className="lobby__url">{hostOf(r.joinUrl)}/join</p>
            <p className="lobby__count">{r.connected} {r.connected === 1 ? "phone" : "phones"} connected</p>
            <p className="lobby__hint">Scan the code, or enter it on the join page. Phones only vote when the host opens a poll.</p>
          </>
        ) : (
          <div className="lobby__offline">
            <p className="bi-label">PHONE JOINING</p>
            <p className="lobby__offline-title">{r.status === "connecting" ? "Connecting to the relay…" : localOnly && r.status === "ready" ? "Phones cannot reach this address" : "Phone joining is unavailable"}</p>
            <p className="lobby__hint">The game still runs from the host laptop.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Interlude({ s }: { s: PublicSnapshot }) {
  const [a, b] = s.teams;
  const lead = a.score === b.score ? null : a.score > b.score ? a : b;
  return (
    <div className="final">
      <p className="bi-label">AFTER ROUND {s.progress.played} OF {s.progress.total}</p>
      <h1 className="final__head">{lead ? `${lead.name} leads` : "All square"}</h1>
      <div className="final__scores">
        {s.teams.map((t) => (
          <div key={t.id} className={`team ${lead?.id === t.id ? "team--active" : ""}`}>
            <p className="team__name">{t.name}</p>
            <p className="team__score">{t.score}</p>
          </div>
        ))}
      </div>
      <p className="intro__sub">&lt;{s.progress.tieBreak ? "TIE-BREAK" : `ROUND ${Math.min(s.progress.played + 1, s.progress.total)}`} IS NEXT&gt;</p>
    </div>
  );
}

function Intro({ s }: { s: PublicSnapshot }) {
  const q = s.round!;
  return (
    <div className="intro">
      <p className="bi-label">{q.category.toUpperCase()} · {s.progress.tieBreak ? "TIE-BREAK" : `ROUND ${q.number} OF ${q.total}`}</p>
      <h1 className="intro__q">{q.prompt}</h1>
      <p className="intro__sub">&lt;FACE-OFF NEXT: WHO BUZZES FIRST?&gt;</p>
    </div>
  );
}

function Tile({ slot }: { slot: PublicSlot }) {
  return (
    <li className={`tile ${slot.revealed ? "tile--shown" : ""}`} aria-label={slot.revealed ? `${slot.index}: ${slot.text}, ${slot.count}` : `${slot.index}: hidden`}>
      <span className="tile__n">{slot.index}</span>
      <span className="tile__text">{slot.revealed ? <span className="tile__t">{slot.text}</span> : null}</span>
      <span className="tile__pts">{slot.revealed ? slot.count : ""}</span>
    </li>
  );
}

const teamName = (s: PublicSnapshot, id: TeamId) => s.teams.find((t) => t.id === id)!.name.toUpperCase();

function FaceOffBar({ s, f }: { s: PublicSnapshot; f: PublicFaceOff }) {
  const turn = faceOffTurn(f);
  const bothMissed = !f.winner && f.tries.A === "miss" && f.tries.B === "miss";
  let text = "ONE PLAYER FROM EACH TEAM TO THE BUZZERS";
  if (f.winner) text = f.choice ? `${teamName(s, f.winner)} ${f.choice === "play" ? "PLAYS" : "PASSES"}` : `${teamName(s, f.winner)} WINS THE FACE-OFF: PLAY OR PASS?`;
  else if (turn) text = f.buzzed === turn ? `${teamName(s, turn)} BUZZED FIRST: ANSWER NOW` : `${teamName(s, turn)}: YOUR ANSWER`;
  else if (bothMissed) text = "BOTH MISSED: NEXT TWO PLAYERS";
  else if (f.armed) text = "BUZZERS LIVE";
  return (
    <div className={`fo ${f.armed ? "fo--live" : ""} ${f.winner ? "fo--won" : ""}`} role="status" aria-live="polite">
      <span className="fo__label">FACE-OFF</span>
      <span className="fo__text">{text}</span>
    </div>
  );
}

function Board({ s }: { s: PublicSnapshot }) {
  const q = s.round!;
  const half = Math.ceil(q.slots.length / 2);
  const cols: PublicSlot[][] = q.columns === 2 ? [q.slots.slice(0, half), q.slots.slice(half)] : [q.slots];
  const inFaceOff = (s.phase === "face_off" || s.phase === "play_or_pass") && s.faceOff;
  return (
    <div className="board">
      <p className="bi-label">{s.phase === "preview" ? `TEMPLATE PREVIEW · ${q.category.toUpperCase()} · NO RESULTS LOADED` : "SURVEY SAYS"}</p>
      <h1 className="board__q">{q.prompt}</h1>
      {inFaceOff && <FaceOffBar s={s} f={s.faceOff!} />}
      <div className={`board__slots cols-${q.columns}`}>
        {cols.map((c, i) => (
          <ol key={i} className="slots" style={{ gridTemplateRows: `repeat(${q.columns === 2 ? half : q.slots.length}, 1fr)` }}>
            {c.map((slot) => <Tile key={slot.index} slot={slot} />)}
          </ol>
        ))}
      </div>
    </div>
  );
}

function TeamCard({ s, id }: { s: PublicSnapshot; id: TeamId }) {
  const t = s.teams.find((x) => x.id === id)!;
  const live = s.phase === "team_turn" || s.phase === "steal";
  const onBoard = live && s.control === id && s.phase === "team_turn";
  const stealing = s.phase === "steal" && s.control !== id;
  const won = s.settlement?.winner === id ? s.settlement : null;
  const f = s.phase === "face_off" || s.phase === "play_or_pass" ? s.faceOff : null;
  const mine = f?.tries[id];
  const faceTag = !f ? "" : f.winner === id ? "WINS THE FACE-OFF" : mine ? (mine === "hit" ? "ON THE BOARD" : "MISSED") : f.buzzed === id ? "BUZZED FIRST" : f.armed ? "BUZZER LIVE" : "";
  const faceActive = !!f && (f.winner === id || faceOffTurn(f) === id);
  const tag = faceTag || (onBoard ? "ON THE BOARD" : stealing ? "STEALING" : won ? `ROUND +${won.amount}` : "");
  return (
    <div className={`team ${onBoard || stealing || faceActive ? "team--active" : ""}`}>
      <p className="team__tag">{tag || " "}</p>
      <p className="team__name">{t.name}</p>
      <p className="team__score">{t.score}</p>
    </div>
  );
}

function Middle({ s }: { s: PublicSnapshot }) {
  const stealing = s.phase === "steal";
  return (
    <div className="mid">
      <p className="bi-label">ROUND POT</p>
      <p className="mid__pot">{s.pot}</p>
      <div className="strikes" aria-label={`${s.strikes} of 3 strikes`}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`strike ${s.strikes >= n ? "strike--on" : ""}`}>{s.strikes >= n ? "X" : ""}</span>
        ))}
      </div>
      <p className="mid__note">
        {s.note ?? (stealing ? "STEAL: ONE GUESS" : s.settlement ? `${s.teams.find((t) => t.id === s.settlement!.winner)!.name.toUpperCase()} TAKES THE POT` : s.strikes > 0 ? `STRIKE ${s.strikes} OF 3` : " ")}
      </p>
    </div>
  );
}

function PollPanel({ poll, prompt }: { poll: PublicPoll; prompt: string }) {
  const remaining = useRemaining(poll);
  const closed = poll.status === "closed";
  const t = closed ? tally(poll) : null;
  const votes = (id: string) => poll.results?.find((r) => r.optionId === id)?.votes ?? 0;
  return (
    <div className="poll" role="status">
      <p className="bi-label">CROWD ASSIST · A SUGGESTION, NOT AN ANSWER</p>
      <h2 className="poll__title">{closed ? "The room suggests" : "Vote on your phone"}</h2>
      <p className="poll__prompt">{prompt}</p>
      <ul className="poll__opts">
        {poll.options.map((o) => {
          const v = votes(o.id);
          const pct = t && t.total ? (v / t.total) * 100 : 0;
          return (
            <li key={o.id} className={`poll__opt ${t?.top.includes(o.id) ? "poll__opt--top" : ""}`}>
              <span className="poll__bar" style={{ width: `${closed ? pct : 0}%` }} />
              <span className="poll__label">{o.label}</span>
              {closed && <span className="poll__votes">{v}</span>}
            </li>
          );
        })}
      </ul>
      {closed ? (
        <p className="poll__foot">{t!.total === 0 ? "No votes. The team decides." : t!.top.length > 1 ? "Tied. The team decides." : "The team decides whether to use it."}</p>
      ) : (
        <div className="poll__foot poll__foot--open">
          <span className="poll__time">{Math.ceil(remaining / 1000)}s</span>
          <span className="poll__meter"><i style={{ width: `${poll.durationMs ? (remaining / poll.durationMs) * 100 : 0}%` }} /></span>
          <span>{poll.responses} {poll.responses === 1 ? "vote" : "votes"} in</span>
        </div>
      )}
    </div>
  );
}

function Final({ s }: { s: PublicSnapshot }) {
  const [a, b] = s.teams;
  const tie = a.score === b.score;
  const win = a.score > b.score ? a : b;
  return (
    <div className="final">
      <p className="bi-label">FINAL SCORE</p>
      <h1 className="final__head">{tie ? "It’s a tie" : `${win.name} wins`}</h1>
      <div className="final__scores">
        {s.teams.map((t) => (
          <div key={t.id} className={`team ${!tie && t.id === win.id ? "team--active" : ""}`}>
            <p className="team__name">{t.name}</p>
            <p className="team__score">{t.score}</p>
          </div>
        ))}
      </div>
      <p className="intro__sub">&lt;THANKS FOR PLAYING&gt;</p>
    </div>
  );
}

/** Pure renderer of the public snapshot. Used by the projector and by the moderator's preview. */
export function ScreenView({ snapshot: s }: { snapshot: PublicSnapshot }) {
  const phase = s.phase;
  const showBoard = s.round && (phase === "preview" || phase === "board_ready" || phase === "face_off" || phase === "play_or_pass" || phase === "team_turn" || phase === "steal" || phase === "round_over");
  return (
    <Stage>
      <div className="screen" data-theme="ice" data-phase={phase}>
        <DemoBanner label={s.demoLabel} />
        {phase !== "lobby" || s.round || s.progress.played > 0 ? <Header s={s} qr /> : null}
        <main className="s-main">
          {phase === "lobby" && !s.round && s.progress.played === 0 && <Lobby s={s} />}
          {phase === "lobby" && !s.round && s.progress.played > 0 && <Interlude s={s} />}
          {phase === "intro" && s.round && <Intro s={s} />}
          {showBoard && <Board s={s} />}
          {showBoard && s.poll && s.round && <PollPanel poll={s.poll} prompt={s.round.prompt} />}
          {phase === "match_over" && <Final s={s} />}
        </main>
        {showBoard && phase !== "preview" && (
          <footer className="s-foot">
            <TeamCard s={s} id="A" />
            <Middle s={s} />
            <TeamCard s={s} id="B" />
          </footer>
        )}
      </div>
    </Stage>
  );
}
