import { RoomQrCode } from "@air-jam/sdk/ui";
import type { TeamId } from "../engine/types";
import type { PublicFaceOff, PublicSlot, PublicSnapshot } from "../public/types";
import { faceOffTurn } from "../public/faceoff";
import { hostOf, isLocalOnly } from "../public/url";
import { Chevron, GdgMark } from "./GdgMark";
import { useNow } from "./poll-bits";
import { Stage } from "./Stage";
import { Wordmark } from "./Wordmark";
import { Swatch } from "./Swatch";
import { teamStyle } from "./teamStyle";

const QR_FG = "#0A1B66";
const QR_BG = "#F3F8FF";

/** A one-off moment on the projector: the red X, or a short banner. Drawn by the projector page only, never the preview. */
export type FlashSpec = { kind: "x"; count: number } | { kind: "banner"; text: string; sub?: string; team?: TeamId };
export type Flash = FlashSpec & { id: number };

const teamOf = (s: PublicSnapshot, id: TeamId) => s.teams.find((t) => t.id === id)!;
const teamName = (s: PublicSnapshot, id: TeamId) => teamOf(s, id).name.toUpperCase();
/** Long names and answers step down a size instead of being cut off. */
/** "ROUND 2 OF 4", or just "ROUND 2" when the game has no question limit. */
const roundOf = (n: number, total: number) => (total > 0 ? `ROUND ${n} OF ${total}` : `ROUND ${n}`);
const fit = (text: string, steps: [number, string][]) => steps.find(([n]) => text.length > n)?.[1] ?? "";

/** The game title in frost on the ice, its brackets drawn as the club mark's coloured chevrons. */
function TitlePlate({ size }: { size: "lg" | "sm" }) {
  return (
    <span className={`title-plate title-plate--${size}`}>
      <Chevron side="open" height={size === "lg" ? 118 : 40} />
      <span className="title-plate__text">FAMILY FEUD</span>
      <Chevron side="close" height={size === "lg" ? 118 : 40} />
    </span>
  );
}

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

/** Phone-buzzer mode only, while a team still needs its buzzer phone. Physical mode never shows a code. */
const pairing = (s: PublicSnapshot) => !!s.room.joinUrl && !isLocalOnly(s.room.joinUrl) && !!s.buzzers && !(s.buzzers.paired.A && s.buzzers.paired.B);

function PairCard({ s }: { s: PublicSnapshot }) {
  return (
    <aside className="pair-card">
      <div className="pair-card__text">
        <p className="s-label">BUZZER PHONES</p>
        <p className="pair-card__code">{s.room.code}</p>
        <p className="pair-card__url">{hostOf(s.room.joinUrl)}/join</p>
        <p className="pair-card__hint">One phone per team. The moderator gives each team its code.</p>
      </div>
      <RoomQrCode value={s.room.joinUrl!} size={196} padding={1} foregroundColor={QR_FG} backgroundColor={QR_BG} errorCorrectionLevel="M" alt="Buzzer phone QR code" />
    </aside>
  );
}

/** Every screen but the title card: the game's name left, the round in the middle, the event and club right. */
function Header({ s }: { s: PublicSnapshot }) {
  const round = s.round && s.round.number > 0 && s.phase !== "intro";
  return (
    <header className="s-head">
      <div className="s-head__left"><TitlePlate size="sm" /></div>
      <div className="s-head__mid">
        {round && (s.timer ? <Timer t={s.timer} /> : <p className="s-head__round">{s.progress.tieBreak ? "TIE-BREAK" : roundOf(s.round!.number, s.round!.total)}</p>)}
      </div>
      <div className="s-head__right">
        <span className="s-head__event">hello, world!</span>
        <GdgMark size={44} />
      </div>
    </header>
  );
}

function TeamPlate({ s, id, lead }: { s: PublicSnapshot; id: TeamId; lead?: boolean }) {
  const t = teamOf(s, id);
  return (
    <div className={`plate ${lead ? "plate--lead" : ""}`} style={teamStyle(t.color)}>
      <p className={`plate__name ${fit(t.name, [[16, "plate__name--long"]])}`}>{t.name}</p>
      <p className="plate__score">{t.score}</p>
    </div>
  );
}

/** The opening title card: one centred composition, nothing reserved for phones unless pairing is needed. */
function Lobby({ s }: { s: PublicSnapshot }) {
  const [a, b] = s.teams;
  return (
    <div className="lobby">
      <p className="lobby__id"><GdgMark size={40} /> <span>GDG ON CAMPUS · UNIVERSITY OF BIRMINGHAM DUBAI</span></p>
      <div className="lobby__mark"><Wordmark width={560} bleed /></div>
      <h1 className="lobby__title"><TitlePlate size="lg" /></h1>
      <div className="lobby__teams">
        <p className={`lobby__team ${fit(a.name, [[14, "lobby__team--long"]])}`} style={teamStyle(a.color)}>{a.name}</p>
        <span className="lobby__vs">VS</span>
        <p className={`lobby__team ${fit(b.name, [[14, "lobby__team--long"]])}`} style={teamStyle(b.color)}>{b.name}</p>
      </div>
      {pairing(s) && <PairCard s={s} />}
    </div>
  );
}

function Interlude({ s }: { s: PublicSnapshot }) {
  const [a, b] = s.teams;
  const lead = a.score === b.score ? null : a.score > b.score ? a : b;
  return (
    <div className="final">
      <p className="s-pill">AFTER {roundOf(s.progress.played, s.progress.total)}</p>
      <h1 className="final__head">{lead ? `${lead.name} leads` : "All square"}</h1>
      <div className="final__scores">
        <TeamPlate s={s} id="A" lead={lead?.id === "A"} />
        <TeamPlate s={s} id="B" lead={lead?.id === "B"} />
      </div>
      <p className="final__next">{s.progress.tieBreak ? "TIE-BREAK" : `ROUND ${s.progress.total > 0 ? Math.min(s.progress.played + 1, s.progress.total) : s.progress.played + 1}`} IS NEXT</p>
    </div>
  );
}

function Intro({ s }: { s: PublicSnapshot }) {
  const q = s.round!;
  return (
    <div className="intro">
      <p className="s-pill">{s.progress.tieBreak ? "TIE-BREAK" : roundOf(q.number, q.total)}</p>
      <h1 className={`intro__q ${fit(q.prompt, [[70, "intro__q--long"]])}`}>{q.prompt}</h1>
      <p className="intro__sub">FACE-OFF NEXT: WHO BUZZES FIRST?</p>
    </div>
  );
}

// The flip is a CSS transition, so it plays when a tile turns over and never when a page loads with it already shown.
function Tile({ slot }: { slot: PublicSlot }) {
  const size = slot.revealed ? fit(slot.text, [[44, "tile__t--xl"], [26, "tile__t--long"]]) : "";
  return (
    <li className={`tile ${slot.revealed ? "tile--shown" : ""}`} aria-label={slot.revealed ? `${slot.index}: ${slot.text}, ${slot.count}` : `${slot.index}: hidden`}>
      <span className="tile__inner">
        <span className="tile__face tile__front" aria-hidden="true">
          <span className="tile__badge">{slot.index}</span>
        </span>
        <span className="tile__face tile__back">
          <span className="tile__n">{slot.index}</span>
          <span className="tile__text">{slot.revealed ? <span className={`tile__t ${size}`}>{slot.text}</span> : null}</span>
          <span className="tile__pts">{slot.revealed ? slot.count : ""}</span>
        </span>
      </span>
    </li>
  );
}

function FaceOffBar({ s, f }: { s: PublicSnapshot; f: PublicFaceOff }) {
  const turn = faceOffTurn(f);
  const bothMissed = !f.winner && f.tries.A === "miss" && f.tries.B === "miss";
  let text = "ONE PLAYER FROM EACH TEAM TO THE BUZZERS";
  if (f.winner) text = f.choice ? `${teamName(s, f.winner)} ${f.choice === "play" ? "PLAYS" : "PASSES"}` : `${teamName(s, f.winner)} WINS THE FACE-OFF: PLAY OR PASS?`;
  else if (turn) text = f.buzzed === turn ? `${teamName(s, turn)} BUZZED FIRST: ANSWER NOW` : `${teamName(s, turn)}: YOUR ANSWER`;
  else if (f.awaitingHosts) text = "OVER TO THE HOSTS: WHO WINS THE FACE-OFF?";
  else if (bothMissed) text = "BOTH MISSED: NEXT TWO PLAYERS";
  // Phone mode: when each press reached the moderator laptop, counted from opening. Not when it was pressed.
  const b = s.buzzers;
  const timing = b?.first && b.first.team === f.buzzed && !f.winner ? b.first : null;
  return (
    <div className={`fo ${f.winner ? "fo--won" : ""}`} role="status" aria-live="polite">
      <span className="fo__label">FACE-OFF</span>
      <span className="fo__text">{text}</span>
      {timing && (
        <span className="fo__time">
          RECEIVED {(timing.ms / 1000).toFixed(2)} S AFTER THE BUZZERS OPENED
          {b!.second && ` · ${teamName(s, b!.second.team)} ${((b!.second.ms - timing.ms) / 1000).toFixed(2)} S LATER`}
        </span>
      )}
    </div>
  );
}

function Board({ s }: { s: PublicSnapshot }) {
  const q = s.round!;
  const half = Math.ceil(q.slots.length / 2);
  const cols: PublicSlot[][] = q.columns === 2 ? [q.slots.slice(0, half), q.slots.slice(half)] : [q.slots];
  const inFaceOff = (s.phase === "face_off" || s.phase === "play_or_pass") && s.faceOff;
  return (
    <div className={`board board--cols-${q.columns}`}>
      {s.phase === "preview" && <p className="s-pill">TEMPLATE PREVIEW · {q.category.toUpperCase()} · NO RESULTS LOADED</p>}
      <h1 className={`board__q ${fit(q.prompt, [[70, "board__q--long"]])}`}>{q.prompt}</h1>
      {inFaceOff && <FaceOffBar s={s} f={s.faceOff!} />}
      <div className={`board__frame cols-${q.columns}`}>
        <div className={`board__slots cols-${q.columns}`}>
          {cols.map((c, i) => (
            <ol key={i} className="slots" style={{ gridTemplateRows: `repeat(${q.columns === 2 ? half : q.slots.length}, 1fr)` }}>
              {c.map((slot) => <Tile key={slot.index} slot={slot} />)}
            </ol>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamCard({ s, id }: { s: PublicSnapshot; id: TeamId }) {
  const t = teamOf(s, id);
  const live = s.phase === "team_turn" || s.phase === "steal";
  const onBoard = live && s.control === id && s.phase === "team_turn";
  const stealing = s.phase === "steal" && s.control !== id;
  const won = s.settlement?.winner === id ? s.settlement : null;
  const f = s.phase === "face_off" || s.phase === "play_or_pass" ? s.faceOff : null;
  const mine = f?.tries[id];
  const faceTag = !f ? "" : f.winner === id ? "WINS THE FACE-OFF" : mine ? (mine === "hit" ? "HIT" : "MISSED") : f.buzzed === id ? "BUZZED FIRST" : faceOffTurn(f) === id ? "ANSWERS NEXT" : "";
  const faceActive = !!f && (f.winner === id || faceOffTurn(f) === id);
  const tag = faceTag || (onBoard ? "PLAYING" : stealing ? "STEALING" : won ? `ROUND +${won.amount}` : "");
  return (
    <div className={`team ${onBoard || stealing || faceActive ? "team--active" : ""}`} style={teamStyle(t.color)}>
      <p className={`team__tag ${tag ? "team__tag--on" : ""}`}>{tag || " "}</p>
      <p className={`team__name ${fit(t.name, [[14, "team__name--long"]])}`}>{t.name}</p>
      <p className="team__score">{t.score}</p>
    </div>
  );
}

function Middle({ s }: { s: PublicSnapshot }) {
  const stealing = s.phase === "steal";
  return (
    <div className="mid">
      <p className="s-label">ROUND POINTS</p>
      <p className="mid__pot">{s.pot}</p>
      <div className="strikes" aria-label={`${s.strikes} of 3 strikes`}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`strike ${s.strikes >= n ? "strike--on" : ""}`}>{s.strikes >= n ? "X" : ""}</span>
        ))}
      </div>
      <p className="mid__note">
        {s.note ?? (stealing ? "STEAL: ONE GUESS" : s.settlement ? `${teamName(s, s.settlement.winner)} TAKES THE POINTS` : s.strikes > 0 ? `STRIKE ${s.strikes} OF 3` : " ")}
      </p>
    </div>
  );
}

function Final({ s }: { s: PublicSnapshot }) {
  const [a, b] = s.teams;
  const tie = a.score === b.score;
  const win = a.score > b.score ? a : b;
  return (
    <div className="final">
      <p className="s-pill">FINAL SCORE</p>
      <h1 className="final__head">{tie ? "It’s a tie" : `${win.name} wins`}</h1>
      <div className="final__scores">
        <TeamPlate s={s} id="A" lead={!tie && win.id === "A"} />
        <TeamPlate s={s} id="B" lead={!tie && win.id === "B"} />
      </div>
      <p className="final__next">THANKS FOR PLAYING</p>
    </div>
  );
}

/** Pure renderer of the public snapshot. Used by the projector and by the moderator's preview. */
export function ScreenView({ snapshot: s, flash }: { snapshot: PublicSnapshot; flash?: Flash | null }) {
  const phase = s.phase;
  const showBoard = s.round && (phase === "preview" || phase === "board_ready" || phase === "face_off" || phase === "play_or_pass" || phase === "team_turn" || phase === "steal" || phase === "round_over");
  const titleCard = phase === "lobby" && !s.round && s.progress.played === 0;
  return (
    <Stage>
      <div className="screen" data-theme="ice" data-phase={phase}>
        {s.demoLabel && <div className="demo-banner" role="status">{s.demoLabel}</div>}
        {!titleCard && <Header s={s} />}
        <main className="s-main">
          {titleCard && <Lobby s={s} />}
          {phase === "lobby" && !s.round && s.progress.played > 0 && <Interlude s={s} />}
          {phase === "intro" && s.round && <Intro s={s} />}
          {showBoard && <Board s={s} />}
          {phase === "match_over" && <Final s={s} />}
        </main>
        {showBoard && phase !== "preview" && (
          <footer className="s-foot">
            <TeamCard s={s} id="A" />
            <Middle s={s} />
            <TeamCard s={s} id="B" />
          </footer>
        )}
        {flash?.kind === "x" && (
          <div key={flash.id} className="flash flash--x" aria-hidden="true">
            {Array.from({ length: flash.count }, (_, i) => <b key={i} className="flash__x">X</b>)}
          </div>
        )}
        {flash?.kind === "banner" && (
          <div key={flash.id} className="flash flash--banner" role="status">
            <div className="flash__band" style={teamStyle(flash.team ? teamOf(s, flash.team).color : null)}>
              <span className="flash__text">{flash.team && <Swatch color={teamOf(s, flash.team).color} />}{flash.text}</span>
              {flash.sub && <span className="flash__sub">{flash.sub}</span>}
            </div>
          </div>
        )}
      </div>
    </Stage>
  );
}
