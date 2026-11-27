import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Markdown } from '../ui/Markdown';
import { RunLog } from '../agent/log';
import { Timeline } from './Timeline';
import { analyze, fixAll, prepareFix, followUp, type Analysis, type Failure, type Prepared } from './flow';
import { requestSite } from '../security/api';
import { platform } from '../platform';
import { zipSync, strToU8 } from 'fflate';

type Msg = { id: number; role: 'user' | 'assistant' | 'tool'; text: string };
type Phase = 'analyzing' | 'ready' | 'fixing' | 'fixed' | 'error';
const HELP = '/files  affected files\n/log  end of the build log\n/diff  the change that was committed\n/fix  locate, write and commit the fix\n/stop  stop what is running\nAnything else is a question about this failure.';
const isCancel = (e: unknown) => e instanceof Error && e.message === 'Cancelled.';
const PILL: Record<Phase, string> = { analyzing: 'Analysing', ready: 'Analysis ready', fixing: 'Fixing', fixed: 'Fixed', error: 'Stopped' };

/**
 * The big popup behind the Analyze button. It reads the repository and the failed build with the configured agents while a faded live timeline
 * shows the agents and terminal actions, then explains the whole bug. The Fix button then locates the affected files, writes the corrected code,
 * commits it, and reports success, with the same timeline running.
 */
export function AnalyzePanel({ failure, token, onClose, onCommitted }: { failure: Failure; token: string; onClose: () => void; onCommitted?: () => void }) {
  const log = useRef(new RunLog()).current;
  const ctl = useRef<AbortController | null>(null);
  const seq = useRef(0); const body = useRef<HTMLDivElement>(null); const end = useRef<HTMLDivElement>(null); const doneCard = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [live, setLive] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [commit, setCommit] = useState<{ sha: string; url: string } | null>(null);
  const [fixBundle, setFixBundle] = useState<Blob|null>(null);
  const [fixBundleName, setFixBundleName] = useState('');
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(''); const [busy, setBusy] = useState(false);
  const add = (role: Msg['role'], text: string) => setMsgs((m) => [...m, { id: ++seq.current, role, text }]);
  const stream = () => { let last = 0; return (t: string) => { const now = Date.now(); if (now - last < 90) return; last = now; setLive(t); }; };

  const start = async () => {
    const c = new AbortController(); ctl.current = c; log.clear(); setPhase('analyzing'); setError(''); setLive('');
    try {
      const a = await analyze(token, failure, { signal: c.signal, log, onText: stream() });
      setAnalysis(a); setLive(''); add('assistant', a.note); setPhase('ready');
      log.say('ok', `analysis complete · ${a.affected.length} affected file${a.affected.length === 1 ? '' : 's'}${a.chunked ? ' · read in parts' : ''}`);
    } catch (e) {
      setLive('');
      if (isCancel(e)) { log.say('warn', 'stopped'); setError('Stopped.'); setPhase('error'); }
      else { const m = e instanceof Error ? e.message : 'The analysis failed.'; log.say('err', m); setError(m); setPhase('error'); }
    } finally { ctl.current = null; }
  };
  useEffect(() => { void start(); return () => ctl.current?.abort(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // The view follows the explanation as it is written, until the person scrolls up to read.
  useEffect(() => { if (stick.current) end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, live, phase]);
  const onScroll = () => { const el = body.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; };

  const fix = async () => {
    if (!analysis || phase === 'fixing') return;
    const c = new AbortController(); ctl.current = c; setPhase('fixing'); setError(''); setCommit(null);
    stick.current = false; body.current?.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      log.say('info', `Fix started · ${analysis.affected.map((a) => a.path).join(', ')}`);
      const entitlement=await requestSite<{premium?:boolean}>('/api/billing/status').catch(()=>({premium:false}));
      if(entitlement.premium){
        if(!window.confirm(`MonyGist Pro can automatically commit verified fixes to ${failure.repo} on ${failure.branch}. Continue?`)){setPhase('ready');return;}
        const r=await fixAll(token,failure,analysis,{signal:c.signal,log});setPrepared(r.prepared);
        if(!r.commit){const m=`No commit was made. ${r.prepared.failed.join(' · ')||'No safe change was produced.'}`;setError(m);add('tool',m);setPhase('ready');return;}
        setCommit(r.commit);setPhase('fixed');onCommitted?.();
      }else{
        log.say('info','Free plan · generating manual-upload repair ZIP (no repository write)');
        const p=await prepareFix(token,failure,analysis,{signal:c.signal,log});setPrepared(p);
        if(p.failed.length||!p.changes.length){const m=`No ZIP generated. ${p.failed.join(' · ')||'No safe change was produced.'}`;setError(m);add('tool',m);setPhase('ready');return;}
        const files:Record<string,Uint8Array>={};
        const paths=p.changes.filter(x=>x.content!==null).map(x=>x.path).filter(path=>!path.split('/').includes('..')&&!path.startsWith('/'));
        for(const change of p.changes)if(change.content!==null&&paths.includes(change.path))files[change.path]=strToU8(change.content);
        const deleted=p.changes.filter(x=>x.content===null).map(x=>x.path);
        files['MONYGIST_FIX_README.md']=strToU8(`# MonyGist manual repair bundle\n\nRepository: ${failure.repo}\nBranch: ${failure.branch}\nBuild: ${failure.title}\n\nFiles included: ${paths.map(x=>`- ${x}`).join('\n')}\n\nFiles to delete manually: ${deleted.map(x=>`- ${x}`).join('\n')||'None'}\n\nApply included files to the repository, delete the listed files if any, then run the project checks and commit manually. MonyGist Free did not write to GitHub.\n`);
        const bytes=zipSync(files,{level:6});const blob=new Blob([bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer],{type:'application/zip'});const name=`monygist-fix-${failure.repo.split('/').pop()}-${Date.now()}.zip`;setFixBundle(blob);setFixBundleName(name);setPhase('fixed');add('assistant',`Prepared a manual repair ZIP containing ${paths.length} corrected file(s). No GitHub changes were made. Download the ZIP and upload the files to your repository manually. Pro can automate verified commits.`);
      }
      setTimeout(() => doneCard.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    } catch (e) {
      if (isCancel(e)) { log.say('warn', 'stopped'); setPhase('ready'); return; }
      const m = e instanceof Error ? e.message : 'The fix failed.'; log.say('err', m); setError(m); setPhase('ready');
    } finally { ctl.current = null; }
  };

  const sendAnalysisToChat = () => {
    if(!analysis)return;
    try{localStorage.setItem('monygist.chat.failure-draft',JSON.stringify({repo:failure.repo,branch:failure.branch,title:failure.title,error:failure.error,log:failure.log,analysis:analysis.text}));location.hash='#/';onClose();}catch{setError('Could not transfer the analysis to chat. Please copy the analysis text manually.');}
  };
  const command = (t: string): boolean => {
    const [cmd] = t.trim().split(/\s+/);
    if (!cmd.startsWith('/')) return false;
    if (cmd === '/help') add('tool', HELP);
    else if (cmd === '/files') add('tool', analysis?.affected.length ? analysis.affected.map((a) => `${a.action.padEnd(6)} ${a.path}${a.reason ? `  — ${a.reason}` : ''}`).join('\n') : 'No affected files yet.');
    else if (cmd === '/log') add('tool', failure.log || 'No build log.');
    else if (cmd === '/diff') add('tool', prepared?.changes.length ? prepared.changes.map((c) => `--- ${c.path}\n${(prepared.diffs[c.path] ?? []).join('\n')}`).join('\n\n') : 'No change has been written yet. Use /fix.');
    else if (cmd === '/fix') { if (analysis && analysis.affected.length) void fix(); else add('tool', 'There is nothing to fix yet.'); }
    else if (cmd === '/stop') ctl.current?.abort();
    else add('tool', `Unknown command ${cmd}.\n${HELP}`);
    return true;
  };
  const send = async () => {
    const q = ask.trim(); if (!q || busy || !analysis) return;
    setAsk(''); if (command(q)) return;
    const history = msgs.filter((m) => m.role !== 'tool').map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }));
    add('user', q); setBusy(true); stick.current = true;
    const c = new AbortController(); ctl.current = c;
    try { const t = await followUp(failure, analysis, history, q, { signal: c.signal, log, onText: stream() }); setLive(''); add('assistant', t); }
    catch (e) { setLive(''); if (!isCancel(e)) add('tool', e instanceof Error ? e.message : 'That question could not be answered.'); }
    finally { setBusy(false); ctl.current = null; }
  };
  const running = phase === 'analyzing' || phase === 'fixing' || busy;
  const canFix = phase === 'ready' && !!analysis && analysis.affected.length > 0;
  const stat = (path: string) => { const d = prepared?.diffs[path] ?? []; return `+${d.filter((l) => l.startsWith('+ ')).length} −${d.filter((l) => l.startsWith('- ')).length}`; };

  return (
    <div className="scrim rp-scrim" role="dialog" aria-modal="true" aria-label="Analyze failed build">
      <div className="rp-modal big">
        <header className="rp-mhead">
          <div><strong>Analyze</strong><small>{failure.title} · {failure.repo} · {failure.branch}</small></div>
          <span className={`rp-pill ${phase === 'fixed' ? 'ok' : phase === 'error' ? 'bad' : running ? 'run' : 'idle'}`}>{PILL[phase]}</span>
          <button className="rp-ib" aria-label="Close" onClick={() => { ctl.current?.abort(); onClose(); }}><Icon name="close" size={18} /></button>
        </header>
        <div className="rp-mbody" ref={body} onScroll={onScroll}>
          <Timeline log={log} title={phase === 'fixing' || phase === 'fixed' ? 'Fix timeline' : 'Analysis timeline'} />
          {msgs.map((m) => m.role === 'tool'
            ? <pre className="rp-tool" key={m.id}>{m.text}</pre>
            : <div className={`rp-msg ${m.role}`} key={m.id}>{m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}</div>)}
          {live && <div className="rp-msg assistant live"><Markdown text={phase === 'analyzing' ? live.replace(/\n*```json[\s\S]*$/i, '') : live} /></div>}
          {analysis && analysis.affected.length > 0 && (
            <div className="rp-files" aria-label="Affected files">
              {analysis.affected.map((a) => <span key={a.path} className={`rp-file ${a.action}`} title={a.reason}><b>{a.action}</b>{a.path}</span>)}
            </div>
          )}
          {error && <p className="rp-err" role="alert">{error}</p>}
          {(commit || fixBundle) && prepared && (
            <div className="rp-success" role="status" ref={doneCard}>
              <div className="rp-sh"><span className="rp-check" aria-hidden="true"><Icon name="check" size={20} /></span><strong>{commit?'Fix committed successfully':'Repair ZIP ready for manual upload'}</strong></div>
              <p>{prepared.changes.length} file{prepared.changes.length === 1 ? '' : 's'} corrected for <b>{failure.branch}</b> in {failure.repo}. {commit?'The commit is on GitHub.':'No GitHub write was made on Free.'}</p>
              {fixBundle && <button className="btn primary" onClick={()=>void platform.saveFile(fixBundle,fixBundleName)}>Download repair ZIP</button>}
              <ul>{prepared.changes.map((c) => <li key={c.path}><code>{c.path}</code><span>{c.content === null ? 'deleted' : stat(c.path)}</span></li>)}</ul>
              {commit && <p className="rp-muted">{failure.kind === 'vercel' ? 'Vercel starts a new build on its own. Refresh the Vercel page in a minute to watch it.' : 'GitHub Actions will run again on this commit.'} <a href={commit.url} target="_blank" rel="noreferrer">View the commit</a></p>}
            </div>
          )}
          <div ref={end} />
        </div>
        <footer className="rp-mfoot">
          {analysis && <button className="btn" onClick={sendAnalysisToChat}>Continue in chat</button>}
          {canFix && <button className="btn primary rp-fix" onClick={() => void fix()}>Fix {analysis!.affected.length} file{analysis!.affected.length === 1 ? '' : 's'}</button>}
          {phase === 'fixing' && <button className="btn" onClick={() => ctl.current?.abort()}>Stop</button>}
          {phase === 'error' && <button className="btn primary" onClick={() => void start()}>Try again</button>}
          {phase === 'analyzing' && <button className="btn" onClick={() => ctl.current?.abort()}>Stop</button>}
          {phase === 'ready' && analysis && analysis.affected.length === 0 && <span className="rp-hint">No repository file needs to change.</span>}
          <div className="rp-ask">
            <input value={ask} disabled={!analysis || running} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder={analysis ? 'Ask about this failure, or type /help' : 'Reading the repository and the logs…'} aria-label="Ask about this failure" />
            <button className="btn" disabled={!analysis || running || !ask.trim()} onClick={() => void send()} aria-label="Send"><Icon name="send" size={16} /></button>
          </div>
        </footer>
      </div>
    </div>
  );
}
