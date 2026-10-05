import { MAX_WRONG_CODES } from "../buzzers/buzzers";
import type { TeamId } from "../engine/types";
import { hostOf, isLocalOnly } from "../public/url";
import { TeamTag } from "./TeamPicker";
import type { HostGame } from "./useHostGame";

const TEAMS: TeamId[] = ["A", "B"];
const secs = (ms: number) => (ms / 1000).toFixed(2);

/** Pairing: each team's code is shown here only, never on the projector or a phone. */
function PhonePairing({ g }: { g: HostGame }) {
  const s = g.state;
  const pub = g.phones;
  const join = g.room.joinUrl && !isLocalOnly(g.room.joinUrl) ? g.room.joinUrl : null;
  const locked = g.buzzers.wrongCodes >= MAX_WRONG_CODES;
  return (
    <div className="sub">
      <p>
        {join ? <>One player per team opens <b>{hostOf(join)}/join</b> and enters room <b>{g.room.code}</b> (the projector shows a QR code until both teams are paired). Then they type their team&apos;s code below.</> : g.room.status === "ready" ? "Phones cannot reach this address. Use the deployed site." : "Connecting to the relay…"}
      </p>
      <ul className="pairs">
        {TEAMS.map((t) => {
          const paired = !!pub?.paired[t];
          return (
            <li key={t} className="pairs__row">
              <span className="pairs__team"><TeamTag name={s.teams[t].name} color={s.teams[t].color} /></span>
              {paired ? (
                <span className={`dot-status ${pub?.online[t] ? "" : "is-bad"}`}>{pub?.online[t] ? "Phone paired and connected" : "Phone paired, disconnected"}</span>
              ) : (
                <span>Code <b className="pairs__code">{g.buzzers.pairs[t].code}</b> <span className="muted">· waiting for a phone</span></span>
              )}
              <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" onClick={() => g.newCodes(t)}>{paired ? "Unpair" : "New code"}</button>
            </li>
          );
        })}
      </ul>
      {locked && <div className="alert alert--bad" role="alert"><b>Pairing locked</b> after {MAX_WRONG_CODES} wrong codes. Someone may be guessing. <button type="button" className="link-btn" onClick={() => g.newCodes()}>Make new codes</button></div>}
      <p className="muted small">Say each code only to that team&apos;s player. A press counts only from the phone that entered its team&apos;s code. Times on the projector are when each press reached this laptop, not when it was pressed.</p>
    </div>
  );
}

/** Setup: which buzzers this event uses. Physical needs no phones and no network. */
export function BuzzerSetup({ g }: { g: HostGame }) {
  return (
    <section className="card" aria-labelledby="buzzers-h">
      <h2 className="card__h" id="buzzers-h">Buzzers</h2>
      <fieldset className="choice">
        <legend className="sr-only">Buzzer type</legend>
        <label className={`choice__opt ${g.buzzerMode === "physical" ? "is-on" : ""}`}>
          <input type="radio" name="buzzers" checked={g.buzzerMode === "physical"} onChange={() => g.setBuzzerMode("physical")} />
          <span><b>Physical buzzers</b> (default). The hosts say which buzzer went first; you tap that team. No phones, no QR code.</span>
        </label>
        <label className={`choice__opt ${g.buzzerMode === "phone" ? "is-on" : ""}`}>
          <input type="radio" name="buzzers" checked={g.buzzerMode === "phone"} onChange={() => g.setBuzzerMode("phone")} />
          <span><b>Phone buzzers</b> (optional, pending Rayyan&apos;s decision). One paired phone per team.</span>
        </label>
      </fieldset>
      {g.buzzerMode === "phone" && <PhonePairing g={g} />}
    </section>
  );
}

/** Live face-off controls for phone buzzers. The tap buttons below them stay as the hosts' override. */
export function PhoneFaceOff({ g }: { g: HostGame }) {
  const p = g.phones;
  if (!p) return null;
  const name = (t: TeamId) => g.state.teams[t].name;
  const missing = TEAMS.filter((t) => !p.online[t]);
  return (
    <div className="phones">
      {missing.length > 0 && <p className="phones__warn">{missing.map((t) => `${name(t)}: ${p.paired[t] ? "phone disconnected" : "no phone paired"}`).join(" · ")}. The hosts can judge it and you tap below.</p>}
      {p.first ? (
        <p className="phones__result" role="status">
          <b>{name(p.first.team)} first</b>, received {secs(p.first.ms)} s after opening
          {p.second ? `; ${name(p.second.team)} ${secs(p.second.ms - p.first.ms)} s later` : ""}. Arrival order, not proof of who pressed first.
        </p>
      ) : (
        <p className="phones__result" role="status">{p.open ? "Phone buzzers open. Waiting for a press…" : "Phone buzzers closed."}</p>
      )}
      <div className="row">
        {!p.open && !p.first && <button type="button" className="bi-button host__btn host__btn--lg" onClick={g.openBuzzers}>Open phone buzzers</button>}
        {(p.open || p.first) && <button type="button" className="bi-button bi-button--outline host__btn" onClick={g.openBuzzers}>Reset and reopen</button>}
        {p.open && <button type="button" className="bi-button bi-button--outline host__btn" onClick={g.closeBuzzers}>Close</button>}
      </div>
    </div>
  );
}
