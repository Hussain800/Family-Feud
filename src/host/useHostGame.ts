import { useAirJamHost } from "@air-jam/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PENDING_PACK } from "../content/canonical";
import { validatePack } from "../content/schema";
import type { Pack, Question } from "../content/types";
import { apply, initialSession } from "../engine/reducer";
import type { Action, Session, TeamId } from "../engine/types";
import { hostHandlers, publishSnapshot, useFeudStore } from "../game/store";
import { DEFAULT_DURATION_MS, cancelPoll, castVote, closePoll, openPoll, tick, voteStatus, type PollState } from "../poll/poll";
import { HEARTBEAT_MS, openChannel } from "../public/channel";
import { projectPublic } from "../public/project";
import type { PublicSnapshot, RelayStatus } from "../public/types";
import { newId } from "../util/id";
import { KEYS, freshSession, hasProgress, loadBackupPack, loadPack, loadSession, saveSession, savePack, writeJson, type SavedSession, type WriteResult } from "./persist";

type UndoAction = { id: string; type: "UNDO" };
type HostAction = Action | UndoAction | { id: string; type: "LOAD"; session: Session };

const reduce = (s: Session, a: HostAction): Session => (a.type === "LOAD" ? a.session : apply(s, a));

export type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type Intent = DistributiveOmit<Action, "id"> | { type: "UNDO" };

const STRIKE_COOLDOWN_MS = 700; // a double click is one strike; a deliberate second one comes later

export function useHostGame() {
  const host = useAirJamHost();
  // Calling the store hook mounts the SDK's host binding: state sync out to phones, vote RPCs in.
  useFeudStore.useActions();
  const [pack, setPack] = useState<Pack>(() => loadPack() ?? structuredClone(PENDING_PACK));
  const [session, setSession] = useState<Session>(() => initialSession());
  const [resumeOffer, setResumeOffer] = useState<SavedSession | null>(() => {
    const s = loadSession();
    return s && hasProgress(s.session) ? s : null;
  });
  // A probe write at start so a broken browser store is visible straight away, not at the first save.
  const [saveStatus, setSaveStatus] = useState<WriteResult | null>(() => writeJson(KEYS.probe, 1));
  const sessionRef = useRef(session);
  const packRef = useRef(pack);
  const holdSave = useRef(resumeOffer !== null); // do not overwrite the saved match before the host chooses
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [poll, setPollState] = useState<PollState | null>(null);
  const pollRef = useRef<PollState | null>(null);
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);

  // -- room ------------------------------------------------------------------
  const relay: RelayStatus = host.connectionStatus === "connected" && host.roomId ? "ready" : host.connectionStatus === "connecting" || host.connectionStatus === "idle" ? "connecting" : "offline";
  const room = useMemo(
    () => ({ code: relay === "ready" ? host.roomId : null, joinUrl: relay === "ready" ? host.joinUrl || null : null, status: relay, connected: host.players.length, capacity: 16 }),
    [relay, host.roomId, host.joinUrl, host.players.length],
  );

  // -- polls -----------------------------------------------------------------
  const commitPoll = useCallback((next: PollState | null) => {
    pollRef.current = next;
    setPollState(next);
  }, []);

  useEffect(() => {
    hostHandlers.cast = (actor, payload) => {
      const { poll: next, result } = castVote(pollRef.current, actor, payload, Date.now());
      if (next !== pollRef.current) commitPoll(next);
      return result;
    };
    hostHandlers.status = (actor, pollId) => voteStatus(pollRef.current, actor, pollId);
    return () => {
      hostHandlers.cast = null;
      hostHandlers.status = null;
    };
  }, [commitPoll]);

  // The host deadline closes the poll.
  useEffect(() => {
    if (poll?.status !== "open") return;
    const t = setTimeout(() => commitPoll(tick(pollRef.current!, Date.now())), Math.max(0, poll.deadline - Date.now()) + 5);
    return () => clearTimeout(t);
  }, [poll?.id, poll?.status, poll?.deadline, commitPoll]);

  // A change to the round while a poll is live cancels it, clearly.
  const prevState = useRef(session.state);
  useEffect(() => {
    const p = prevState.current;
    const s = session.state;
    prevState.current = s;
    if (pollRef.current?.status === "open" && (p.round !== s.round || p.phase !== s.phase || p.teams !== s.teams)) {
      commitPoll(cancelPoll(pollRef.current));
      setNotice("Poll cancelled because the round changed.");
    }
  }, [session.state, commitPoll]);

  const canPoll = relay === "ready" && session.state.phase === "team_turn";
  const startPoll = (candidates: string[], durationMs = DEFAULT_DURATION_MS): string | null => {
    if (!canPoll) return "Crowd assist needs a live team turn and a connected relay.";
    const r = openPoll(candidates, Date.now(), newId, durationMs);
    if (!r.ok) return r.error;
    commitPoll(r.poll);
    return null;
  };
  const endPoll = () => pollRef.current && commitPoll(closePoll(pollRef.current));
  const clearPoll = () => commitPoll(null);

  // If the relay drops mid-poll the poll cannot finish; say so instead of hanging.
  useEffect(() => {
    if (relay !== "ready" && pollRef.current?.status === "open") {
      commitPoll(cancelPoll(pollRef.current));
      setNotice("Poll cancelled: phones lost contact. Carry on by voice.");
    }
  }, [relay, commitPoll]);

  // -- saving: after every meaningful host action, never from an effect --------
  const commit = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
    if (!holdSave.current) setSaveStatus(saveSession(packRef.current.packId, next));
  }, []);
  const updatePack = useCallback((next: Pack) => {
    setSaveStatus(savePack(next, packRef.current)); // the pack being replaced is kept as a recoverable copy
    packRef.current = next;
    setPack(next);
  }, []);

  const resume = () => {
    holdSave.current = false;
    if (resumeOffer) commit(resumeOffer.session);
    setResumeOffer(null);
    setNotice(resumeOffer ? "Saved match restored. Any unfinished poll was cancelled." : null);
  };
  const startFresh = () => {
    holdSave.current = false;
    commit(freshSession());
    setResumeOffer(null);
  };

  // -- engine ----------------------------------------------------------------
  const lastStrike = useRef(0);
  const act = useCallback((intent: Intent) => {
    const t = Date.now();
    if (intent.type === "STRIKE") {
      if (t - lastStrike.current < STRIKE_COOLDOWN_MS) return;
      lastStrike.current = t;
    }
    commit(reduce(sessionRef.current, { id: newId(), ...intent } as HostAction));
  }, [commit]);

  const startRound = (q: Question, team: TeamId) => {
    setPreviewId(null);
    act({ type: "START_ROUND", team, question: { id: q.id, category: q.category, prompt: q.prompt, demo: pack.purpose === "demo", answers: q.answers } });
  };

  const restoreSession = (s: Session, p: Pack) => {
    updatePack(p);
    holdSave.current = false;
    commit(s);
    commitPoll(null);
  };

  // -- public snapshot -------------------------------------------------------
  const rev = useRef(Date.now()); // monotonic across reloads, so a reloaded host is never "older"
  const latest = useRef<PublicSnapshot | null>(null);
  const chan = useRef<ReturnType<typeof openChannel> | null>(null);
  const preview = previewId ? PENDING_PACK.questions.find((q) => q.id === previewId) : null;
  const demo = pack.purpose === "demo" || session.state.round?.demo === true;

  useEffect(() => {
    const snap = projectPublic({
      rev: ++rev.current,
      game: session.state,
      demo,
      room,
      poll,
      now: Date.now(),
      preview: preview && session.state.phase === "lobby" ? { category: preview.category, prompt: preview.prompt } : null,
    });
    latest.current = snap;
    chan.current?.post({ kind: "snapshot", snapshot: snap });
    publishSnapshot(snap);
    setSnapshot(snap);
  }, [session.state, demo, room, poll, preview]);

  useEffect(() => {
    const c = openChannel((m) => {
      if (m.kind === "request" && latest.current) c.post({ kind: "snapshot", snapshot: latest.current });
      // Another moderator window in this browser is publishing too: two consoles would fight over one save.
      if (m.kind === "snapshot") setDuplicate(true);
    });
    chan.current = c;
    if (latest.current) c.post({ kind: "snapshot", snapshot: latest.current });
    const beat = setInterval(() => c.post({ kind: "heartbeat", rev: rev.current }), HEARTBEAT_MS);
    return () => {
      clearInterval(beat);
      c.close();
      chan.current = null;
    };
  }, []);

  const backupPack = useMemo(() => loadBackupPack(), [pack]); // eslint-disable-line react-hooks/exhaustive-deps

  const replacePack = (raw: unknown): { ok: true; warnings: string[] } | { ok: false; errors: string[] } => {
    const r = validatePack(raw);
    if (!r.ok) return r; // a rejected import leaves the current pack and game alone
    updatePack(r.pack);
    return { ok: true, warnings: r.warnings };
  };

  return {
    host,
    pack,
    replacePack,
    resetPack: () => updatePack(structuredClone(PENDING_PACK)),
    backupPack,
    session,
    state: session.state,
    canUndo: session.history.length > 0,
    act,
    startRound,
    resumeOffer,
    resume,
    startFresh,
    restoreSession,
    saveStatus,
    notice,
    setNotice,
    room,
    relay,
    poll,
    canPoll,
    startPoll,
    endPoll,
    clearPoll,
    previewId,
    setPreviewId,
    snapshot,
    duplicate,
    demo,
  };
}

export type HostGame = ReturnType<typeof useHostGame>;
