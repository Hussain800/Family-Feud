import { useState } from "react";
import { DEMO_PACK_RAW } from "../content/canonical";
import type { Answer, Pack, Question, ResponseMode } from "../content/types";
import { ConfirmButton } from "./PlayTab";
import { download } from "./persist";
import type { HostGame } from "./useHostGame";

type Report = { ok: true; warnings: string[]; text: string } | { ok: false; errors: string[] } | null;

function ImportPanel({ g }: { g: HostGame }) {
  const [text, setText] = useState("");
  const [report, setReport] = useState<Report>(null);
  const load = (raw: string) => {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return setReport({ ok: false, errors: [`Not valid JSON: ${e instanceof Error ? e.message : "parse error"}`] });
    }
    const r = g.replacePack(json);
    setReport(r.ok ? { ok: true, warnings: r.warnings, text: "Pack loaded. The previous pack was kept as a recoverable copy." } : r);
    if (r.ok) setText("");
  };
  return (
    <div className="panel">
      <h2 className="panel__h">Import survey results (JSON)</h2>
      <p className="hint">Paste or choose the pack file. It is validated first; a rejected import changes nothing. Real results stay in this browser and are never published.</p>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Choose pack JSON file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) load(await f.text());
          e.target.value = "";
        }}
      />
      <textarea className="input input--area" rows={5} placeholder='{"schemaVersion":1,"packId":"…","purpose":"event","questions":[…]}' value={text} onChange={(e) => setText(e.target.value)} aria-label="Pack JSON" />
      <div className="row">
        <button type="button" className="bi-button host__btn" disabled={!text.trim()} onClick={() => load(text)}>Validate and load</button>
      </div>
      {report && !report.ok && (
        <div className="alert" role="alert">
          <b>Import rejected. Nothing was changed.</b>
          <ul>{report.errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}</ul>
          {report.errors.length > 12 && <p>…and {report.errors.length - 12} more.</p>}
        </div>
      )}
      {report?.ok && (
        <div className="alert alert--notice" role="status">
          {report.text}
          {report.warnings.length > 0 && <ul>{report.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

function PackPanel({ g }: { g: HostGame }) {
  const ready = g.pack.questions.filter((q) => q.status === "ready").length;
  return (
    <div className="panel">
      <h2 className="panel__h">Active pack</h2>
      <p><b>{g.pack.title}</b> · {g.pack.purpose === "demo" ? "DEMO: INVENTED RESULTS" : "event pack"} · {ready} of 16 questions ready</p>
      <p className="hint">A round already in progress keeps its own copy of its answers, so loading a pack cannot change points already on the board.</p>
      <div className="row">
        <ConfirmButton label="Load demo pack" confirmLabel="replace pack with invented results" onConfirm={() => g.replacePack(DEMO_PACK_RAW)} />
        <ConfirmButton label="Reset to empty event template" confirmLabel="clear all results" onConfirm={g.resetPack} />
        <button type="button" className="bi-button bi-button--outline host__btn" onClick={() => download(`feud-pack-${g.pack.packId}.json`, g.pack)}>Export pack</button>
        {g.backupPack && (
          <ConfirmButton label="Restore previous pack" confirmLabel={`swap back to “${g.backupPack.title}”`} onConfirm={() => g.replacePack(g.backupPack)} />
        )}
      </div>
    </div>
  );
}

interface Row {
  id: string;
  text: string;
  count: string;
  aliases: string;
}

const toRows = (q: Question): Row[] => q.answers.map((a) => ({ id: a.id, text: a.text, count: String(a.count), aliases: a.aliases.join(", ") }));

function Editor({ g }: { g: HostGame }) {
  const [qid, setQid] = useState("q01");
  const [saved, setSaved] = useState(""); // lives here because saving remounts the form below
  const q = g.pack.questions.find((x) => x.id === qid)!;
  // The form is remounted whenever the question or its saved contents change, so its draft never goes stale.
  const stamp = `${q.id}:${q.status}:${q.survey.source}:${q.answers.map((a) => `${a.id}/${a.text}/${a.count}`).join("|")}`;
  return (
    <div className="panel">
      <h2 className="panel__h">Answer editor</h2>
      <label className="field">
        <span className="bi-label">QUESTION (WORDING IS FIXED)</span>
        <select className="input" value={qid} onChange={(e) => { setQid(e.target.value); setSaved(""); }}>
          {g.pack.questions.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.prompt}</option>)}
        </select>
      </label>
      <EditorForm key={stamp} g={g} q={q} onSaved={setSaved} />
      {saved && <div className="alert alert--notice" role="status">{saved}</div>}
    </div>
  );
}

function EditorForm({ g, q, onSaved }: { g: HostGame; q: Question; onSaved: (msg: string) => void }) {
  const [rows, setRows] = useState<Row[]>(toRows(q));
  const [source, setSource] = useState(q.survey.source === "events_team_pending" ? "" : q.survey.source);
  const [respondents, setRespondents] = useState(q.survey.respondents ? String(q.survey.respondents) : "");
  const [mode, setMode] = useState<ResponseMode>(q.survey.responseMode);
  const [errors, setErrors] = useState<string[]>([]);
  const demoPack = g.pack.purpose === "demo";
  const locked = g.state.round?.questionId === q.id && !g.state.round.settlement;
  const off = demoPack || locked;

  const build = (status: "ready" | "awaiting_survey"): Pack => {
    const answers: Answer[] = rows
      .filter((r) => r.text.trim() || r.count.trim())
      .map((r, i) => ({ id: r.id || `host-${q.id}-${Date.now().toString(36)}${i}`, rank: i + 1, text: r.text, count: Number(r.count), aliases: r.aliases.split(",").map((a) => a.trim()).filter(Boolean) }));
    const next: Question =
      status === "ready"
        ? {
            ...q,
            status,
            answers,
            survey: { source: source.trim() || "host_entered", respondents: respondents.trim() ? Number(respondents) : null, responseMode: mode, collectedAt: q.survey.collectedAt, note: q.survey.note },
            approval: { confirmedBy: "host", confirmedAt: new Date().toISOString() },
          }
        : { ...q, status, answers: [], approval: null, survey: { ...q.survey, source: "events_team_pending", responseMode: "unconfirmed", respondents: null } };
    return { ...g.pack, questions: g.pack.questions.map((x) => (x.id === q.id ? next : x)) };
  };
  const save = (status: "ready" | "awaiting_survey") => {
    const r = g.replacePack(build(status));
    setErrors(r.ok ? [] : r.errors);
    onSaved(r.ok ? (status === "ready" ? "Saved. This question is ready to play." : "Cleared. Question is awaiting survey results.") : "");
  };

  return (
    <>
      {demoPack && <p className="warn">The demo pack is read-only so invented results can never be relabelled as real. Reset to the empty event template to enter real results.</p>}
      {locked && <p className="warn">This round is underway. Its answers are locked until the round ends.</p>}
      <fieldset className="editor" disabled={off}>
        <div className="editor__head"><span className="bi-label">ANSWER (UP TO 10)</span><span className="bi-label">COUNT</span><span className="bi-label">ALSO ACCEPT (COMMA SEPARATED)</span><span /></div>
        {rows.map((r, i) => (
          <div className="editor__row" key={i}>
            <input className="input" aria-label={`Answer ${i + 1}`} value={r.text} maxLength={80} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
            <input className="input input--sm" aria-label={`Count ${i + 1}`} inputMode="numeric" value={r.count} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, count: e.target.value } : x)))} />
            <input className="input" aria-label={`Aliases ${i + 1}`} value={r.aliases} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, aliases: e.target.value } : x)))} />
            <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" aria-label={`Remove answer ${i + 1}`} onClick={() => setRows(rows.filter((_, k) => k !== i))}>Remove</button>
          </div>
        ))}
        <div className="row">
          <button type="button" className="bi-button bi-button--outline host__btn host__btn--sm" disabled={rows.length >= 10} onClick={() => setRows([...rows, { id: "", text: "", count: "", aliases: "" }])}>Add answer</button>
        </div>
        <div className="row">
          <label className="field"><span className="bi-label">WHERE THE RESULTS CAME FROM</span><input className="input" value={source} placeholder="e.g. events team survey sheet" maxLength={80} onChange={(e) => setSource(e.target.value)} /></label>
          <label className="field"><span className="bi-label">RESPONDENTS (IF KNOWN)</span><input className="input input--sm" inputMode="numeric" value={respondents} onChange={(e) => setRespondents(e.target.value)} /></label>
          <label className="field"><span className="bi-label">RESPONSE MODE</span>
            <select className="input input--sm" value={mode} onChange={(e) => setMode(e.target.value as ResponseMode)}>
              <option value="unconfirmed">unconfirmed</option><option value="single">single answer each</option><option value="multiple">multiple answers each</option>
            </select>
          </label>
        </div>
        <div className="row">
          <button type="button" className="bi-button host__btn" onClick={() => save("ready")}>Confirm these as event results</button>
          <ConfirmButton label="Clear results" confirmLabel="mark awaiting survey" onConfirm={() => save("awaiting_survey")} />
        </div>
      </fieldset>
      <p className="hint">Counts are survey points as supplied. They are not scaled to 100.</p>
      {errors.length > 0 && <div className="alert" role="alert"><b>Not saved.</b><ul>{errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
    </>
  );
}

export function DataTab({ g }: { g: HostGame }) {
  return (
    <div className="stack">
      <PackPanel g={g} />
      <ImportPanel g={g} />
      <Editor g={g} />
    </div>
  );
}

