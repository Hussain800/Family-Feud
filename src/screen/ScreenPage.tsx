import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HEARTBEAT_MS, STALE_AFTER_MS, openChannel } from "../public/channel";
import type { PublicSnapshot } from "../public/types";
import { ScreenView } from "../ui/ScreenView";
import { Sfx, cueFor } from "../ui/sound";

export function ScreenPage() {
  const { roomCode = "" } = useParams();
  const [snap, setSnap] = useState<PublicSnapshot | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const [now, setNow] = useState(Date.now());
  const sfx = useRef(new Sfx()).current;
  const [audio, setAudio] = useState({ unlocked: false, muted: false, volume: 0.6 });
  const [quiet, setQuiet] = useState(false);
  const [fs, setFs] = useState(false);
  const [awake, setAwake] = useState(true);
  const prev = useRef<PublicSnapshot | null>(null);

  useEffect(() => {
    const ch = openChannel((m) => {
      if (m.kind === "snapshot") {
        // Only accept newer revisions so a late message cannot roll the board back.
        setSnap((cur) => (cur && m.snapshot.rev < cur.rev ? cur : m.snapshot));
        setLastSeen(Date.now());
      } else if (m.kind === "heartbeat") setLastSeen(Date.now());
    });
    ch.post({ kind: "request" }); // ask for the current snapshot on load
    const retry = setInterval(() => ch.post({ kind: "request" }), HEARTBEAT_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      ch.close();
      clearInterval(retry);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    if (!snap) return;
    const cue = cueFor(prev.current, snap);
    prev.current = snap;
    if (cue) sfx.play(cue);
  }, [snap, sfx]);

  // The control bar steps aside once sound is on or the screen is fullscreen; any pointer or key brings it back.
  useEffect(() => {
    let t = 0;
    const wake = () => {
      setAwake(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setAwake(false), 4000);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const unlock = useCallback(async () => {
    const ok = await sfx.unlock();
    setAudio((a) => ({ ...a, unlocked: ok }));
  }, [sfx]);
  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  const setMuted = (muted: boolean) => {
    sfx.muted = muted;
    sfx.apply();
    setAudio((a) => ({ ...a, muted }));
  };
  const setVolume = (volume: number) => {
    sfx.volume = volume;
    sfx.apply();
    setAudio((a) => ({ ...a, volume }));
  };
  const toggleQuiet = () => {
    const q = !quiet;
    setQuiet(q);
    setMuted(q || audio.muted);
  };

  const stale = snap !== null && now - lastSeen > STALE_AFTER_MS;
  const mismatch = snap?.room.code && roomCode !== "local" && roomCode.toUpperCase() !== snap.room.code;

  return (
    <div className="screen-page" data-quiet={quiet || undefined}>
      {snap ? (
        <ScreenView snapshot={snap} />
      ) : (
        <div className="screen-wait" data-theme="ice">
          <p className="bi-label">GDG ON CAMPUS · UOBD</p>
          <h1>Waiting for the moderator</h1>
          <p>Open <Link to="/host">/host</Link> in another window on this laptop. This screen fills in by itself.</p>
        </div>
      )}
      {stale && (
        <div className="screen-stale" role="status" data-theme="ice">
          <p className="bi-label">RECONNECTING</p>
          <p>Lost contact with the moderator window. The board returns when it does.</p>
        </div>
      )}
      {mismatch && <div className="screen-mismatch" role="status">URL says room {roomCode.toUpperCase()}, host is on {snap!.room.code}</div>}
      <div className={`screen-bar ${!awake && (fs || audio.unlocked) ? "screen-bar--idle" : ""}`} data-theme="ice">
        <button type="button" className="bar-btn" onClick={unlock} aria-pressed={audio.unlocked}>{audio.unlocked ? "SOUND READY" : "ENABLE SOUND"}</button>
        <button type="button" className="bar-btn" onClick={() => setMuted(!audio.muted)} aria-pressed={audio.muted}>{audio.muted ? "UNMUTE" : "MUTE"}</button>
        <label className="bar-vol">VOL
          <input type="range" min={0} max={1} step={0.05} value={audio.volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
        <button type="button" className="bar-btn" onClick={toggleQuiet} aria-pressed={quiet}>QUIET {quiet ? "ON" : "OFF"}</button>
        <button type="button" className="bar-btn" onClick={toggleFs}>{fs ? "EXIT FULLSCREEN" : "FULLSCREEN"}</button>
      </div>
    </div>
  );
}
