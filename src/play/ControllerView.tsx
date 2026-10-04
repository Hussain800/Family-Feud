import { useAirJamController } from "@air-jam/sdk";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TeamId } from "../engine/types";
import { useFeudStore } from "../game/store";

/** This phone's pairing, held in memory only: a refreshed phone pairs again with a new code from the moderator. */
type Me = { team: TeamId; token: string; gen: number };
type Mine = { armId: string; status: "sending" | "first" | "second" | "duplicate" | "error"; text?: string };
type Reply = { ok: boolean; result?: Record<string, unknown>; reason?: string; message?: string };

function Shell({ children, label, demo }: { children: ReactNode; label: string; demo: string | null }) {
  return (
    <div className="phone" data-theme="ice">
      {demo && <div className="demo-banner demo-banner--phone" role="status">{demo}</div>}
      <header className="phone__head">
        <p className="bi-label">GDG ON CAMPUS · UOBD</p>
        <p className="bi-label phone__state" role="status">{label}</p>
      </header>
      <main className="phone__main">{children}</main>
    </div>
  );
}

function PairForm({ onPaired }: { onPaired: (me: Me) => void }) {
  const actions = useFeudStore.useActions();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) return setMsg("The code is 4 digits.");
    setBusy(true);
    try {
      const r = (await actions.pairBuzzer({ code })) as Reply;
      if (r.ok && r.result) onPaired({ team: r.result.team as TeamId, token: String(r.result.token), gen: Number(r.result.gen) });
      else setMsg(r.message ?? "Could not pair. Try again.");
    } catch {
      setMsg("Could not reach the moderator. Try again.");
    }
    setBusy(false);
  };
  return (
    <>
      <h1 className="phone__title">Pair this phone as your team&apos;s buzzer</h1>
      <p className="phone__lead">Ask the moderator for your team&apos;s 4-digit code.</p>
      <form onSubmit={submit} className="phone__form">
        <label className="bi-label" htmlFor="pair-code">TEAM CODE</label>
        <input id="pair-code" className="phone__input" inputMode="numeric" autoComplete="off" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setMsg(""); }} aria-describedby="pair-err" />
        <p id="pair-err" className="phone__error" role="alert">{msg}</p>
        <button className="bi-button phone__btn" type="submit" disabled={busy}>{busy ? "Pairing…" : "Pair"}</button>
      </form>
    </>
  );
}

export function ControllerView() {
  const c = useAirJamController();
  const snap = useFeudStore((s) => s.snapshot);
  const actions = useFeudStore.useActions();
  const [me, setMe] = useState<Me | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const busy = useRef(false); // one send at a time: a double tap is one press
  const demo = snap.demoLabel;
  const b = snap.buzzers;

  if (!c.roomId) {
    return (
      <Shell label="NO ROOM" demo={demo}>
        <h1 className="phone__title">No room code</h1>
        <p className="phone__lead">Scan the QR code on the big screen, or enter the code.</p>
        <Link className="bi-button phone__btn" to="/join">Enter a code</Link>
      </Shell>
    );
  }
  if (/full/i.test(c.lastError ?? "")) {
    return (
      <Shell label="UNAVAILABLE" demo={demo}>
        <h1 className="phone__title">This room is full</h1>
        <p className="phone__lead">Only each team&apos;s buzzer phone needs to join. Everyone else can watch the big screen.</p>
      </Shell>
    );
  }
  if (/not found/i.test(c.lastError ?? "")) {
    return (
      <Shell label="UNAVAILABLE" demo={demo}>
        <h1 className="phone__title">Room not found</h1>
        <p className="phone__lead">Check the code on the big screen. If the moderator restarted, the room code changed: ask for the new one.</p>
        <Link className="bi-button phone__btn" to="/join">Enter a code</Link>
      </Shell>
    );
  }
  if (c.connectionStatus === "connecting" || c.connectionStatus === "idle") {
    return (
      <Shell label="CONNECTING" demo={demo}>
        <h1 className="phone__title">Joining {c.roomId}…</h1>
      </Shell>
    );
  }
  if (c.connectionStatus !== "connected") {
    return (
      <Shell label="DISCONNECTED" demo={demo}>
        <h1 className="phone__title">Disconnected</h1>
        <p className="phone__lead">This buzzer does nothing until it reconnects. The hosts can judge the face-off meanwhile.</p>
        <button type="button" className="bi-button bi-button--outline phone__btn" onClick={() => c.reconnect()}>Try now</button>
      </Shell>
    );
  }
  if (!b) {
    return (
      <Shell label={`ROOM ${c.roomId}`} demo={demo}>
        <h1 className="phone__title">This game uses physical buzzers</h1>
        <p className="phone__lead">Nothing to do on your phone. Watch the big screen.</p>
      </Shell>
    );
  }
  // A pairing the moderator has since reset (new codes, the next teams) is gone: this phone controls nothing.
  if (!me || b.gen[me.team] !== me.gen) {
    return (
      <Shell label="NOT PAIRED" demo={demo}>
        <PairForm onPaired={(m) => { setMe(m); setMine(null); }} />
      </Shell>
    );
  }

  const team = snap.teams.find((t) => t.id === me.team)!.name;
  const other = snap.teams.find((t) => t.id !== me.team)!.name;
  const press = mine && mine.armId === b.armId ? mine : null;
  const firstIsMe = b.first?.team === me.team;
  const lockedOut = !!b.first && !firstIsMe;
  const ready = b.open && !!b.armId && !press && !b.first;

  const buzz = async () => {
    if (!b.armId || busy.current) return;
    busy.current = true;
    const armId = b.armId;
    navigator.vibrate?.(40);
    setMine({ armId, status: "sending" });
    try {
      const r = (await actions.buzz({ armId, token: me.token })) as Reply;
      setMine({ armId, status: r.ok ? (r.result?.status as Mine["status"]) : "error", text: r.message });
      if (!r.ok && r.reason === "not_paired") setMe(null);
    } catch {
      setMine({ armId, status: "error", text: "Could not reach the moderator." });
    }
    busy.current = false;
  };

  let state = "WAITING";
  let line = "Wait for the moderator to open the buzzers.";
  if (press?.status === "sending") [state, line] = ["SENDING", "Sending your press…"];
  else if (firstIsMe) [state, line] = ["RECEIVED", "First press received. Answer now!"];
  else if (lockedOut) [state, line] = ["LOCKED OUT", `${other} buzzed first.`];
  else if (press?.status === "error") [state, line] = ["NOT COUNTED", press.text ?? "That press did not count."];
  else if (ready) [state, line] = ["READY", "Press when you know the answer."];

  return (
    <Shell label={`${team.toUpperCase()} BUZZER · ${state}`} demo={demo}>
      <button
        type="button"
        className={`buzz ${ready ? "buzz--ready" : ""} ${firstIsMe ? "buzz--first" : ""} ${lockedOut ? "buzz--locked" : ""}`}
        disabled={!ready}
        onClick={() => void buzz()}
        aria-label={`${team} buzzer: ${state.toLowerCase()}`}
      >
        {firstIsMe ? "FIRST!" : lockedOut ? "LOCKED" : ready ? "BUZZ" : state === "SENDING" ? "…" : "WAIT"}
      </button>
      <p className="phone__lead phone__lead--center" role="status">{line}</p>
    </Shell>
  );
}
