import { useAirJamController } from "@air-jam/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFeudStore } from "../game/store";
import type { PublicPoll } from "../public/types";
import { tally, useRemaining } from "../ui/poll-bits";
import { newId } from "../util/id";

type Mine = { kind: "none" } | { kind: "sending"; optionId: string } | { kind: "accepted"; optionId: string } | { kind: "error"; message: string };

const RETRIES = 3; // bounded; every retry carries the same logical vote

function Shell({ children, label, demo }: { children: React.ReactNode; label: string; demo: string | null }) {
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

function Ballot({ poll, prompt }: { poll: PublicPoll; prompt: string }) {
  const actions = useFeudStore.useActions();
  const controller = useAirJamController();
  const [mine, setMine] = useState<Mine>({ kind: "none" });
  const busy = useRef(false); // one send at a time: a double tap cannot create a second vote
  const remaining = useRemaining(poll);
  const open = poll.status === "open";

  // A returning identity (refresh, reconnect) recovers its accepted status.
  useEffect(() => {
    if (!open || controller.connectionStatus !== "connected") return;
    let alive = true;
    void actions.pollStatus({ pollId: poll.id }).then((r) => {
      const res = r as { ok: boolean; result?: { voted: boolean; optionId?: string } };
      if (alive && res.ok && res.result?.voted && res.result.optionId) setMine({ kind: "accepted", optionId: res.result.optionId });
    });
    return () => {
      alive = false;
    };
  }, [poll.id, controller.connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const vote = useCallback(
    async (optionId: string) => {
      if (busy.current) return;
      busy.current = true;
      setMine({ kind: "sending", optionId });
      const requestId = newId();
      let last = "Could not reach the host. Try again.";
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        try {
          const r = (await actions.castVote({ pollId: poll.id, optionId, requestId })) as { ok: boolean; reason?: string; message?: string };
          if (r.ok) {
            setMine({ kind: "accepted", optionId }); // only after the host acknowledged
            busy.current = false;
            return;
          }
          if (r.reason === "already_voted") {
            // Our earlier attempt may have landed; ask which choice the host holds.
            const s = (await actions.pollStatus({ pollId: poll.id })) as { result?: { voted: boolean; optionId?: string } };
            if (s.result?.voted && s.result.optionId) {
              setMine({ kind: "accepted", optionId: s.result.optionId });
              busy.current = false;
              return;
            }
          }
          last = r.message ?? last;
          if (r.reason && r.reason !== "socket_disconnected" && r.reason !== "host_ack_timeout" && r.reason !== "session_not_ready") break;
        } catch {
          /* network blip: retry the same vote */
        }
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
      }
      setMine({ kind: "error", message: last });
      busy.current = false;
    },
    [actions, poll.id],
  );

  if (!open) {
    const t = tally(poll);
    return (
      <>
        <h1 className="phone__title">Voting closed</h1>
        <p className="phone__lead">{t.total === 0 ? "No votes this time." : `${t.total} ${t.total === 1 ? "vote" : "votes"} counted. Results are on the big screen.`}</p>
        <ul className="phone__results">
          {poll.options.map((o) => {
            const v = poll.results?.find((r) => r.optionId === o.id)?.votes ?? 0;
            return (
              <li key={o.id} className={t.top.includes(o.id) ? "is-top" : ""}>
                <span>{o.label}</span>
                <b>{v}</b>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  const done = mine.kind === "accepted";
  return (
    <>
      <p className="phone__timer" aria-live="off">{Math.ceil(remaining / 1000)}s left</p>
      <p className="phone__q">{prompt}</p>
      <h1 className="phone__title">{done ? "VOTE RECEIVED" : "What should the team guess?"}</h1>
      <ul className="phone__opts">
        {poll.options.map((o) => {
          const picked = (mine.kind === "accepted" || mine.kind === "sending") && mine.optionId === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                className={`bi-button phone__opt ${picked ? "is-picked" : "bi-button--outline"}`}
                disabled={done || mine.kind === "sending" || controller.connectionStatus !== "connected"}
                aria-pressed={picked}
                onClick={() => void vote(o.id)}
              >
                {o.label}
                {picked && <span className="phone__tick">{mine.kind === "sending" ? "SENDING" : "✓ SENT"}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="phone__lead" role="status">
        {mine.kind === "error" ? mine.message : done ? "Thanks. Your vote is in. You cannot change it." : mine.kind === "sending" ? "Sending…" : "One vote each. The team decides what to use."}
      </p>
    </>
  );
}

export function ControllerView() {
  const c = useAirJamController();
  const snap = useFeudStore((s) => s.snapshot);
  const demo = snap.demoLabel;

  if (!c.roomId) {
    return (
      <Shell label="NO ROOM" demo={demo}>
        <h1 className="phone__title">No room code</h1>
        <p className="phone__lead">Scan the QR code on the big screen, or enter the code.</p>
        <Link className="bi-button phone__btn" to="/join">Enter a code</Link>
      </Shell>
    );
  }
  const full = /full/i.test(c.lastError ?? "");
  if (full) {
    return (
      <Shell label="UNAVAILABLE" demo={demo}>
        <h1 className="phone__title">This room is full</h1>
        <p className="phone__lead">The game still runs on the big screen. Phones are only for the crowd-assist vote.</p>
      </Shell>
    );
  }
  if (/not found/i.test(c.lastError ?? "")) {
    return (
      <Shell label="UNAVAILABLE" demo={demo}>
        <h1 className="phone__title">Room not found</h1>
        <p className="phone__lead">Check the code on the big screen. If the host restarted the game, the room code changed: ask for the new one.</p>
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
      <Shell label="RECONNECTING" demo={demo}>
        <h1 className="phone__title">Reconnecting…</h1>
        <p className="phone__lead">{c.lastError ? c.lastError : "Hold on. The game carries on without you."}</p>
        <button type="button" className="bi-button bi-button--outline phone__btn" onClick={() => c.reconnect()}>Try now</button>
      </Shell>
    );
  }
  if (snap.poll) {
    return (
      <Shell label={snap.poll.status === "open" ? "VOTING OPEN" : "VOTING CLOSED"} demo={demo}>
        <Ballot key={snap.poll.id} poll={snap.poll} prompt={snap.round?.prompt ?? ""} />
      </Shell>
    );
  }
  return (
    <Shell label={`ROOM ${c.roomId} · CONNECTED`} demo={demo}>
      <h1 className="phone__title">You’re in</h1>
      <p className="phone__lead">Watch the big screen. When the host opens a crowd-assist poll, your options appear here.</p>
    </Shell>
  );
}
