import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, Upload, Loader2, Play, Plus, RefreshCw, Square, Terminal as TerminalIcon, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { checkTermux, cleanTerminalText, isNativeAndroid, openTermux, redactSecrets, requestTermuxPermission, safeWorkspaceName, termux } from "../../../lib/termux";
import { confirmDialog } from "../dialog";
import { toastError, toastInfo, toastSuccess } from "../toast";
import { loadState, saveState } from "../storage";
import { addLog } from "../logs";
import { copy, saveFile } from "../utils";
import { nativeNotify } from "../wybuildBridge";

const SETUP_COMMAND = "mkdir -p ~/.termux && grep -qx 'allow-external-apps = true' ~/.termux/termux.properties 2>/dev/null || echo 'allow-external-apps = true' >> ~/.termux/termux.properties; termux-reload-settings";
const PRESETS = [
  { label: "Tool versions", steps: ["node -v && npm -v && git --version"] },
  { label: "Install tools", steps: ["pkg install -y nodejs git"] },
  { label: "Install → build → test", steps: ["npm install", "npm run build", "npm test"] },
  { label: "Git status", steps: ["git status -sb"] },
];
const DISPLAY_LIMIT = 400000; // render window only; the complete log stays in Termux (~/.pothub/jobs/<id>/out)
const newStep = (command = "") => ({ id: `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, command });
const firstLine = (text, max = 200) => { const l = String(text || "").split("\n")[0]; return l.length > max ? `${l.slice(0, max)}…` : l; };
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const chip = { succeeded: "ok", running: "warn", starting: "warn", failed: "bad", stopped: "bad", lost: "bad", pending: "", exited: "" };

export default function TermuxTerminal({ working }) {
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [cwd, setCwd] = useState(() => loadState("termuxCwd", "~"));
  const [steps, setSteps] = useState(() => { const saved = loadState("termuxSteps", null); return Array.isArray(saved) && saved.length ? saved.map((s) => newStep(s.command)) : [newStep("")]; });
  const [stopOnFail, setStopOnFail] = useState(true);
  const [history, setHistory] = useState(() => loadState("termuxHistory", []));
  const [phase, setPhase] = useState("idle"); // idle | running | stopping
  const [stepStates, setStepStates] = useState([]);
  const [view, setView] = useState("");
  const [summary, setSummary] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [mirror, setMirror] = useState(true);
  const [sync, setSync] = useState(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const abortRef = useRef(null);
  const bufferRef = useRef("");
  const flushRef = useRef(0);
  const preRef = useRef(null);
  const stickRef = useRef(true);
  const mountedRef = useRef(true);
  const busy = phase !== "idle";
  const ready = Boolean(check?.connected);
  const native = isNativeAndroid();

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; clearTimeout(flushRef.current); abortRef.current?.abort(); }; }, []);
  useEffect(() => { saveState("termuxCwd", cwd); }, [cwd]);
  useEffect(() => { saveState("termuxSteps", steps.map((s) => ({ command: s.command }))); }, [steps]);
  useEffect(() => { if (!busy) return undefined; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [busy]);
  useEffect(() => { const el = preRef.current; if (el && stickRef.current) el.scrollTop = el.scrollHeight; }, [view]);

  const flush = useCallback(() => {
    clearTimeout(flushRef.current);
    flushRef.current = setTimeout(() => { if (mountedRef.current) setView(cleanTerminalText(bufferRef.current).slice(-DISPLAY_LIMIT)); }, 70);
  }, []);
  const push = useCallback((text) => { bufferRef.current += text; if (bufferRef.current.length > 5_000_000) bufferRef.current = bufferRef.current.slice(-5_000_000); flush(); }, [flush]);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setChecking(true);
    try {
      const next = await checkTermux();
      if (!mountedRef.current) return;
      setCheck(next);
      if (next.connected) { try { const list = await termux.list(); if (mountedRef.current) setJobs(list); } catch { /* listing is optional */ } }
    } finally { if (!quiet && mountedRef.current) setChecking(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && !busy) refresh(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, busy]);

  const grant = async () => { try { await requestTermuxPermission(); } catch (e) { toastError(e.message); } refresh(); };
  const launch = async () => { try { await openTermux(); } catch (e) { toastError(e.message); } };
  const copyText = async (text, label) => { if (await copy(text)) toastSuccess(`${label} copied`); else toastError("Could not copy"); };

  const finish = (ok, title, detail, logText) => {
    setSummary({ ok, title, detail });
    addLog({ type: ok ? "Termux run" : "Termux run failed", text: redactSecrets(logText).slice(-6000) });
    if (typeof document !== "undefined" && document.visibilityState !== "visible") nativeNotify("PotHub Termux", `${title}${detail ? ` — ${detail}` : ""}`);
    (ok ? toastSuccess : toastError)(title);
  };

  const run = async () => {
    const list = steps.map((s) => s.command.trim()).filter(Boolean);
    if (!list.length || busy) return;
    if (!ready) { toastError("Termux is not ready yet. Finish the setup above."); return; }
    const ok = await confirmDialog({
      title: "Run in Termux?",
      message: `These commands run on your phone inside Termux, with access to everything Termux can reach.\n\nFolder: ${cwd.trim() || "~"}\n\n${list.map((c, i) => `${i + 1}. ${firstLine(c, 300)}`).join("\n")}`,
      confirmLabel: "Run",
      danger: true,
    });
    if (!ok) return;
    const controller = new AbortController();
    abortRef.current = controller;
    bufferRef.current = ""; setView(""); setSummary(null); stickRef.current = true;
    setStepStates(list.map(() => ({ status: "pending", exitCode: null })));
    setPhase("running"); setStartedAt(Date.now()); setNow(Date.now());
    setHistory((h) => { const next = [...list.filter((c) => !h.includes(c)), ...h].slice(0, 12); saveState("termuxHistory", next); return next; });
    const results = [];
    const mark = (i, patch) => setStepStates((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    try {
      for (let i = 0; i < list.length; i++) {
        push(`${i ? "\n" : ""}▶ [${i + 1}/${list.length}] ${firstLine(list[i])}\n`);
        mark(i, { status: "running" });
        const res = await termux.run({ command: list[i], cwd: cwd.trim(), signal: controller.signal, onOutput: push, onState: (s) => { if (s === "running") mark(i, { status: "running" }); } });
        results.push(res);
        mark(i, { status: res.state, exitCode: res.exitCode });
        if (res.stopped) break;
        if (!res.success) { push(`\n✖ exited with code ${res.exitCode ?? "unknown"}${res.lost ? " (Termux stopped the process; check battery restrictions for Termux)" : ""}\n`); if (stopOnFail) break; }
      }
      const last = results[results.length - 1];
      const allOk = results.length === list.length && results.every((r) => r.success);
      const text = `${list.map((c, i) => `${i + 1}. ${firstLine(c)} → ${results[i] ? `${results[i].state} (${results[i].exitCode ?? "?"})` : "not run"}`).join("\n")}\n\n${cleanTerminalText(results.map((r) => r.output).join("\n"))}`;
      if (last?.stopped) finish(false, "Stopped", "The command was stopped.", text);
      else finish(allOk, allOk ? "Finished successfully" : "Finished with errors", last && !last.success ? `exit code ${last.exitCode ?? "unknown"}` : "", text);
    } catch (error) {
      push(`\n✖ ${error.message}\n`);
      mark(results.length, { status: "failed" });
      finish(false, "Could not run in Termux", error.message, `${list.join("\n")}\n\n${error.message}`);
    } finally { if (mountedRef.current) { setPhase("idle"); refresh(true); } abortRef.current = null; }
  };

  const attach = async (job) => {
    if (busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    bufferRef.current = ""; setView(""); setSummary(null); stickRef.current = true;
    setStepStates([{ status: job.state === "running" ? "running" : job.state, exitCode: job.exitCode }]);
    setPhase("running"); setStartedAt(job.startedAt || Date.now()); setNow(Date.now());
    push(`▶ ${job.state === "running" ? "Attached to running job" : "Log of finished job"}: ${firstLine(job.command)}\n`);
    try {
      const res = await termux.follow(job.id, { signal: controller.signal, onOutput: push, onState: (s) => setStepStates([{ status: s, exitCode: null }]) });
      setStepStates([{ status: res.state, exitCode: res.exitCode }]);
      setSummary({ ok: res.success, title: res.stopped ? "Stopped" : res.success ? "Finished successfully" : "Finished with errors", detail: res.exitCode == null ? "" : `exit code ${res.exitCode}` });
    } catch (error) { push(`\n✖ ${error.message}\n`); setSummary({ ok: false, title: "Could not read job", detail: error.message }); }
    finally { if (mountedRef.current) { setPhase("idle"); refresh(true); } abortRef.current = null; }
  };

  const stop = () => { if (!abortRef.current) return; setPhase("stopping"); abortRef.current.abort(); toastInfo("Stopping…"); };

  const sendProject = async () => {
    const files = working?.files;
    const count = files ? Object.keys(files).length : 0;
    if (!count || busy || sync?.busy) return;
    if (!ready) { toastError("Termux is not ready yet. Finish the setup above."); return; }
    const label = working?.repo?.full_name || working?.repo?.name || "project";
    const name = safeWorkspaceName(label.replace("/", "__"));
    const ok = await confirmDialog({
      title: "Send project to Termux?",
      message: `${count} file(s) from ${label} will be written to ~/.pothub/workspaces/${name} on your phone.${mirror ? "\n\nFiles there that are not in this project are removed (node_modules and .git are kept)." : "\n\nExisting files with the same name are overwritten."}`,
      confirmLabel: "Send files",
    });
    if (!ok) return;
    setSync({ busy: true, sent: 0, total: 1 });
    try {
      const res = await termux.writeProject({ name, files, mirror, onProgress: (p) => setSync({ busy: true, sent: p.sent, total: p.total }) });
      setCwd(res.workspace);
      setSync(null);
      toastSuccess(`Sent ${res.files} file(s) to Termux`);
      addLog({ type: "Termux project sync", repo: label, branch: working?.branch || "", text: `Sent ${res.files} file(s) (${res.bytes} bytes) to ${res.workspace}.` });
    } catch (error) { setSync(null); toastError(error.message); }
  };

  const saveLog = async () => {
    const text = cleanTerminalText(bufferRef.current);
    if (!text) return;
    try { await saveFile(new Blob([redactSecrets(text)], { type: "text/plain;charset=utf-8" }), `termux-log-${Date.now()}.txt`, "text/plain"); toastSuccess("Log saved"); } catch (e) { toastError(e.message); }
  };

  const setStepCommand = (id, command) => setSteps((list) => list.map((s) => (s.id === id ? { ...s, command } : s)));
  const usePreset = (preset) => { if (!busy) setSteps(preset.steps.map(newStep)); };
  const hasProject = Boolean(working?.files && Object.keys(working.files).length);
  const elapsed = busy && startedAt ? clock(now - startedAt) : "";

  return (
    <div className="page termuxPage">
      <header>
        <div>
          <span className="eyebrow">TERMUX</span>
          <h1>Run on your phone</h1>
          <p className="muted">Build, test and fix with real commands in Termux and watch the output live.</p>
        </div>
        <button className="ghost" onClick={() => refresh()} disabled={checking || busy}><RefreshCw size={16} />Check</button>
      </header>

      <section className="panel">
        <h3>CONNECTION</h3>
        <div className="termuxStatusRow">
          <span className={`termuxChip ${ready ? "ok" : "bad"}`}>{ready ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{ready ? "Connected" : checking ? "Checking…" : "Not connected"}</span>
          {check?.version ? <span className="muted">Termux {check.version}</span> : null}
          {ready && check?.probe ? <span className="muted">{["node", "npm", "git", "python"].map((t) => `${t} ${check.probe.tools?.[t] ? "✓" : "–"}`).join("  ")}</span> : null}
        </div>
        {!ready && !checking ? (
          <div className="termuxSetup">
            {!native ? <p className="muted">{check?.message || "Termux runs commands on your Android phone. Open PotHub in the Android app to use it."}</p> : (
              <>
                {check?.error ? <p className="error"><TriangleAlert size={14} /> {check.error}</p> : null}
                {check?.message && !check?.error ? <p className="muted">{check.message}</p> : null}
                <ol>
                  <li>Install Termux from F-Droid or its GitHub releases (not the Play Store build).{check?.installed ? " ✓" : ""}</li>
                  <li>Open Termux once, paste this line, and press Enter:<code>{SETUP_COMMAND}</code><button onClick={() => copyText(SETUP_COMMAND, "Setup line")}><Copy size={14} />Copy</button></li>
                  <li>Allow PotHub to run commands in Termux.{check?.permissionGranted ? " ✓" : ""}</li>
                </ol>
                <div className="termuxButtons">
                  <button onClick={launch}><TerminalIcon size={16} />Open Termux</button>
                  <button onClick={grant} disabled={!check?.installed || check?.permissionGranted}>Allow PotHub</button>
                  <button className="primary" onClick={() => refresh()}><RefreshCw size={16} />Check again</button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      {hasProject ? (
        <section className="panel">
          <h3>OPEN PROJECT</h3>
          <p className="muted">{working?.repo?.full_name || working?.repo?.name} · {Object.keys(working.files).length} file(s). Copy it into Termux so commands can build and test it.</p>
          <label className="termuxCheck"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Remove files that are no longer in the project (keeps node_modules and .git)</label>
          <div className="termuxButtons">
            <button className="primary" onClick={sendProject} disabled={!ready || busy || Boolean(sync?.busy)}><Upload size={16} />{sync?.busy ? `Sending… ${Math.round((sync.sent / sync.total) * 100)}%` : "Send to Termux"}</button>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h3>COMMANDS</h3>
        <label htmlFor="termuxCwd" className="muted">Folder (~ is the Termux home)</label>
        <input id="termuxCwd" className="searchInput" value={cwd} onChange={(e) => setCwd(e.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={busy} />
        <div className="termuxPresets">{PRESETS.map((p) => <button key={p.label} onClick={() => usePreset(p)} disabled={busy}>{p.label}</button>)}</div>
        <div className="termuxSteps">
          {steps.map((s, i) => (
            <div className="termuxStep" key={s.id}>
              <span className="termuxStepNo">{i + 1}</span>
              <textarea rows={Math.min(6, Math.max(1, s.command.split("\n").length))} value={s.command} onChange={(e) => setStepCommand(s.id, e.target.value)} placeholder="e.g. npm run build" spellCheck={false} autoCapitalize="off" autoCorrect="off" disabled={busy} aria-label={`Command ${i + 1}`} />
              {stepStates[i] && busy ? <span className={`termuxChip ${chip[stepStates[i].status] || ""}`}>{stepStates[i].status}</span> : null}
              <button onClick={() => setSteps((l) => (l.length > 1 ? l.filter((x) => x.id !== s.id) : [newStep("")]))} disabled={busy} aria-label={`Remove command ${i + 1}`}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <label className="termuxCheck"><input type="checkbox" checked={stopOnFail} onChange={(e) => setStopOnFail(e.target.checked)} disabled={busy} /> Stop at the first failing step</label>
        <div className="termuxButtons">
          <button onClick={() => setSteps((l) => [...l, newStep("")])} disabled={busy}><Plus size={16} />Add step</button>
          {busy ? <button className="danger" onClick={stop} disabled={phase === "stopping"}><Square size={16} />{phase === "stopping" ? "Stopping…" : "Stop"}</button> : <button className="primary" onClick={run} disabled={!ready || !steps.some((s) => s.command.trim())}><Play size={16} />Run in Termux</button>}
        </div>
        {history.length ? (
          <div className="termuxHistory"><span className="muted">Recent:</span>{history.slice(0, 6).map((c) => <button key={c} onClick={() => !busy && setSteps([newStep(c)])} disabled={busy} title={c}>{firstLine(c, 40)}</button>)}</div>
        ) : null}
      </section>

      {view || busy ? (
        <section className="panel">
          <div className="panelTitleRow">
            <h3>OUTPUT</h3>
            <div className="termuxStatusRow">
              {busy ? <span className="termuxChip warn"><Loader2 size={14} className="spin" />{phase === "stopping" ? "stopping" : "live"} {elapsed}</span> : summary ? <span className={`termuxChip ${summary.ok ? "ok" : "bad"}`}>{summary.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{summary.title}{summary.detail ? ` · ${summary.detail}` : ""}</span> : null}
            </div>
          </div>
          <pre className="termuxOut" ref={preRef} onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }} aria-live="polite">{view || "Starting…"}</pre>
          <div className="termuxButtons">
            <button onClick={() => copyText(cleanTerminalText(bufferRef.current), "Output")} disabled={!view}><Copy size={16} />Copy</button>
            <button onClick={saveLog} disabled={!view}><Download size={16} />Save log</button>
          </div>
        </section>
      ) : null}

      {ready && jobs.length ? (
        <section className="panel">
          <h3>RECENT TERMUX JOBS</h3>
          <p className="muted">Jobs keep running in Termux if PotHub closes. Attach to watch them again.</p>
          <div className="termuxJobs">
            {jobs.slice(0, 8).map((j) => (
              <div className="termuxJob" key={j.id}>
                <span className={`termuxChip ${chip[j.state] || ""}`}>{j.state}{j.exitCode != null ? ` (${j.exitCode})` : ""}</span>
                <code title={j.command}>{firstLine(j.command, 70) || j.id}</code>
                <button onClick={() => attach(j)} disabled={busy}>{j.state === "running" ? "Attach" : "View log"}</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
