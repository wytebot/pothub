// The analyse → fix → commit workflow behind the Analyze and Fix buttons. Every step is written to a terminal-style log.
import { askAgent, askOverFiles, TooLarge, type Block } from './agent';
import { commitFiles, getTree, readFile, type FileChange, type TreeItem } from './github';
import { importsOf, IGNORED, CONFIG_FILES } from './imports';
import { applyBlocks, checkChange, miniDiff, parseAffected, parseBlocks, parseFiles, stripAffected, type Affected } from './patch';
import { resolvePaths } from './buildLog';
import { auditSource } from '../codelab/audit';
import { mapLimit } from '../agent/chunking';
import type { RunLog } from '../agent/log';

export interface Failure {
  kind: 'vercel' | 'github';
  title: string;            // e.g. "Vercel build ba24050"
  repo: string;             // owner/name
  branch: string;
  error: string;            // the error text shown on the card
  log: string;              // the tail of the build log
  named: string[];          // files the error names
}
export interface Analysis { text: string; note: string; affected: Affected[]; files: Record<string, string>; tree: TreeItem[]; chunked: boolean }
export interface Prepared { changes: FileChange[]; before: Record<string, string | null>; summary: string[]; failed: string[]; diffs: Record<string, string[]> }

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const WHOLE_MAX = 24_000;     // larger files are edited with search/replace blocks instead of being rewritten
const READ_MAX = 300_000;     // larger files are not sent at all

export const ANALYZE_SYSTEM = `You are a senior build and release engineer. A build failed and you must explain it thoroughly to the person who owns the repository.
Work only from evidence: the error, the build log and the repository files you are given. Never invent files, functions, line numbers or package versions; if something cannot be known from the material, say what is missing.
Write a complete, readable explanation, not a summary. Use these Markdown sections, in this order, each with a ## heading:
## What happened
A plain-language account of the failed build: which step failed, what the tool was doing and what it reported.
## Root cause
Exactly why it failed: the file(s), line(s), names and the mistaken assumption. Quote the key log line(s) in a code block.
## Evidence
The chain of proof from the log to the files: what each relevant log line means and which file it points to.
## Affected files
One short subsection per file that must change (path in code font): what is wrong in it now and what it must contain instead. Then one line naming related files that need no change.
## Why this breaks the build
How the problem spreads (imports, types, configuration, ordering) and why the build tool stops.
## How to fix it
Numbered steps, in order, specific enough to carry out.
## How to confirm
Which build step should pass afterwards and what the log will show.
## How to prevent it
Two or three concrete habits or checks.
If the cause is not in the code (an environment variable, a project setting, a file in the wrong folder), say so plainly under Root cause and explain what to change outside the repository.
Finish with ONE fenced json block and nothing after it, listing only the files that must change, with paths exactly as they appear in the repository tree:
\`\`\`json
{"files":[{"path":"src/example.ts","action":"edit","reason":"why"}]}
\`\`\`
action is "edit", "create" or "delete". Use {"files":[]} when no repository file needs to change.`;

const PLAN_SYSTEM = `You are a senior engineer planning a precise code change before it is written.
For every file listed, give 2 to 4 bullets saying exactly what to change: names, signatures, imports and exports, and where. Keep the files consistent with each other.
Do not write the full code. Under 250 words.`;

const FIX_SYSTEM = `You are a careful senior engineer who writes code changes that are applied automatically and committed.
Make the smallest change that fixes the stated problem. Keep the file's style, imports and exports. Never leave placeholders such as "rest of file" or "...". Never change unrelated code.`;

const cleanTree = (tree: TreeItem[]) => tree.filter((t) => !IGNORED.test(t.path));

/** Reads the repository around a failure and explains it. Nothing is changed. */
export async function analyze(token: string, f: Failure, o: { signal: AbortSignal; log: RunLog; onText: (t: string) => void; history?: { role: 'user' | 'assistant'; text: string }[] }): Promise<Analysis> {
  const { log, signal } = o;
  log.say('info', 'Phase 1 · Reading the repository and the failed build');
  const s1 = log.start('cmd', `git ls-tree -r ${f.repo}@${f.branch}`);
  const { tree: full, truncated } = await getTree(token, f.repo, f.branch);
  const tree = cleanTree(full); const paths = new Set(tree.map((t) => t.path));
  log.done(s1, `${tree.length} files${truncated ? ' (GitHub listed part of a large repository)' : ''}`);

  // Files the error names, the config files, and what the named files import (one level).
  const named = resolvePaths(f.named, [...paths]);
  const config = CONFIG_FILES.filter((c) => paths.has(c));
  const want = new Set<string>([...named, ...config]);
  const s2 = log.start('cmd', `git show ${named.length ? named.join(' ') : 'config files'}`);
  const files: Record<string, string> = {};
  const load = async (list: string[]) => {
    await mapLimit(list.filter((p) => !(p in files)), 4, async (p) => {
      const size = tree.find((t) => t.path === p)?.size ?? 0;
      if (size > READ_MAX) return;
      const t = await readFile(token, f.repo, p, f.branch); if (t !== null) files[p] = t;
    });
  };
  await load([...want]);
  const imports = new Set<string>();
  for (const p of named) if (files[p]) for (const i of importsOf(p, files[p], paths)) if (!want.has(i)) imports.add(i);
  await load([...imports].slice(0, 8));
  log.done(s2, `${Object.keys(files).length} files read`);
  if (signal.aborted) throw new Error('Cancelled.');

  const listing = tree.slice(0, 1500).map((t) => t.path).join('\n') + (tree.length > 1500 ? `\n… ${tree.length - 1500} more files` : '');
  const blocks: Block[] = [{ path: 'REPOSITORY FILE LIST', text: listing }, ...Object.entries(files).map(([path, text]) => ({ path, text }))];
  const header = `Repository: ${f.repo} (account ${f.repo.split('/')[0]}), branch ${f.branch}\nFailure: ${f.title}\n\nError shown to the person:\n${f.error}\n\nEnd of the build log:\n${f.log}`;

  const r = await askOverFiles({
    signal, log, onText: o.onText, system: ANALYZE_SYSTEM, long: true, blocks, header,
    mapTask: 'List which of these files (and which lines) relate to the error, what they import or export that matters, and anything in them that could cause it. Keep exact names and paths.',
    final: 'Now write the analysis in the required structure, ending with the json block.',
  });
  return { text: r.text, note: stripAffected(r.text), affected: parseAffected(r.text), files, tree, chunked: r.chunked };
}

/** A question about the same failure, answered from the analysis (no files are re-sent). */
export async function followUp(f: Failure, a: Analysis, history: { role: 'user' | 'assistant'; text: string }[], question: string, o: { signal: AbortSignal; log: RunLog; onText: (t: string) => void }): Promise<string> {
  const ctx = `Repository ${f.repo}@${f.branch}. Failure: ${f.title}\nError:\n${f.error}\n\nYour earlier analysis:\n${a.note.slice(0, 6000)}`;
  const r = await askAgent({ ...o, system: `${ANALYZE_SYSTEM.split('Structure the answer')[0]}Answer the person's follow-up question directly and briefly. Do not repeat the whole analysis.`, history: [{ role: 'user', text: ctx }, { role: 'assistant', text: 'Understood.' }, ...history], prompt: question });
  return r.text;
}

const related = (a: Analysis, skip: string): string => {
  const names = Object.keys(a.files).filter((p) => p !== skip && a.files[p].length <= 6000).slice(0, 4);
  return names.length ? `\n\nOther files for reference (do not rewrite them):\n${names.map((p) => `=== ${p} ===\n${a.files[p]}`).join('\n\n')}` : '';
};

/** Writes the corrected code for every affected file. Nothing is committed here. */
export async function prepareFix(token: string, f: Failure, a: Analysis, o: { signal: AbortSignal; log: RunLog; plan?: string }): Promise<Prepared> {
  const { log, signal } = o;
  const out: Prepared = { changes: [], before: {}, summary: [], failed: [], diffs: {} };
  const paths = new Set(a.tree.map((t) => t.path));
  for (const item of a.affected) {
    if (signal.aborted) throw new Error('Cancelled.');
    let path = item.path;
    if (item.action !== 'create' && !paths.has(path)) { const hit = resolvePaths([path], [...paths])[0]; if (hit) path = hit; }
    if (item.action === 'edit' && !paths.has(path)) { out.failed.push(`${item.path}: not in the repository`); log.say('err', `edit ${item.path}`, 'that file is not in the repository'); continue; }
    if (item.action === 'delete') {
      if (!paths.has(path)) { out.failed.push(`${path}: not in the repository`); continue; }
      out.changes.push({ path, content: null }); out.before[path] = a.files[path] ?? null; out.summary.push(`delete ${path}`); log.say('ok', `rm ${path}`, item.reason); continue;
    }
    const exists = paths.has(path);
    if (exists && a.files[path] === undefined) { const t = await readFile(token, f.repo, path, f.branch); if (t !== null) a.files[path] = t; }
    const before = exists ? (a.files[path] ?? null) : null;
    if (exists && before === null) { out.failed.push(`${path}: could not be read (binary or too large)`); log.say('err', `read ${path}`, 'could not be read'); continue; }
    const s = log.start('cmd', `${exists ? 'edit' : 'create'} ${path}`);
    let whole = !exists || before!.length <= WHOLE_MAX; let feedback = '';
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const how = whole
        ? `Return the COMPLETE new content of the file in this exact format and nothing else:\n=== FILE: ${path} ===\n<entire file>\n=== END FILE ===`
        : `The file is large. Return ONLY the edits, each in this exact format (SEARCH must match the current file exactly and appear once):\n<<<<<<< SEARCH\n<exact existing lines>\n=======\n<replacement lines>\n>>>>>>> REPLACE`;
      const prompt = `Repository ${f.repo}@${f.branch}\nFailure: ${f.title}\nError:\n${f.error.slice(0, 2500)}\n\nAnalysis:\n${a.note.slice(0, 4000)}\n\nWhy this file: ${item.reason || 'it is part of the failure'}${o.plan ? `\n\nPlan for the fix:\n${o.plan.slice(0, 3000)}` : ''}\n\n${exists ? `Current content of ${path}:\n=== ${path} ===\n${before}` : `Create the new file ${path}.`}${related(a, path)}\n\n${how}${feedback}`;
      let text: string;
      try { text = (await askAgent({ signal, log, system: FIX_SYSTEM, prompt, code: true, role: `writing ${path}` })).text; }
      catch (e) { if (e instanceof TooLarge && !whole) { feedback = ''; continue; } log.fail(s, msg(e)); out.failed.push(`${path}: ${msg(e)}`); done = true; break; }
      let after: string | null = null; let problem = '';
      if (whole) { const got = parseFiles(text).find((x) => x.path === path) ?? (parseFiles(text).length === 1 ? parseFiles(text)[0] : undefined); if (got) after = got.content; else problem = 'the answer did not contain the file in the required format'; }
      else { const res = applyBlocks(before!, parseBlocks(text)); if (res.ok) after = res.text; else problem = res.error; }
      if (after !== null) {
        const v = checkChange(path, before, after, { whole });
        // A fix must not introduce a secret, a private key or dynamic code execution that the file did not already have.
        const had = new Set(before === null ? [] : auditSource(path, before).filter((x) => x.severity === 'high').map((x) => x.rule));
        for (const x of auditSource(path, after)) if (x.severity === 'high' && !had.has(x.rule)) v.problems.push(`it adds a ${x.rule.replace('-', ' ')} (line ${x.line})`);
        if (before !== null && before === after) v.problems.push('the file came back unchanged, so it does not contain a fix');
        v.ok = v.problems.length === 0;
        if (v.ok) { out.changes.push({ path, content: after }); out.before[path] = before; out.diffs[path] = before === null ? after.split('\n').slice(0, 40).map((l) => `+ ${l}`) : miniDiff(before, after); out.summary.push(`${exists ? 'edit' : 'create'} ${path}`); log.done(s, `${before === null ? after.split('\n').length : out.diffs[path].filter((l) => /^[+-] /.test(l)).length} lines changed · checks passed`); done = true; break; }
        problem = v.problems.join('; ');
      }
      log.say('warn', `${path}: change rejected`, problem);
      feedback = `\n\nYour previous answer was rejected because ${problem}. Try again and follow the format exactly.`;
      if (!whole && before!.length <= 120_000 && /could not be found|matches/.test(problem)) { whole = true; feedback += ' This time return the complete file.'; }
    }
    if (!done) { log.fail(s, 'could not produce a safe change'); out.failed.push(`${path}: no safe change could be produced`); }
  }
  return out;
}

/** Commits the prepared change to the branch as one commit that replaces the old files. */
export async function commitFix(token: string, f: Failure, p: Prepared, o: { log: RunLog }): Promise<{ sha: string; url: string }> {
  const first = f.error.split('\n')[0].replace(/\s+/g, ' ').trim();
  const message = `Fix ${f.kind === 'vercel' ? 'build' : 'workflow'}: ${first.slice(0, 60)}\n\nApplied by MonyGist from the analysis of ${f.title}.\n${p.summary.map((s) => `- ${s}`).join('\n')}`;
  const s = o.log.start('cmd', `git commit && git push origin ${f.branch}`);
  try {
    const tree = await getTree(token, f.repo, f.branch).catch(() => null);
    const modes: Record<string, string> = {}; for (const t of tree?.tree ?? []) if (t.mode) modes[t.path] = t.mode;
    const r = await commitFiles(token, f.repo, f.branch, p.changes, message, modes);
    o.log.done(s, `${r.sha.slice(0, 7)} · ${p.changes.length} file${p.changes.length === 1 ? '' : 's'}`);
    return r;
  } catch (e) { o.log.fail(s, msg(e)); throw e; }
}

/**
 * The whole Fix button: locate the affected files (fresh from the branch), understand the error (a short plan), write the corrected code,
 * check it, and commit it. Every step is written to the timeline. Nothing is committed unless every file passed its checks.
 */
export async function fixAll(token: string, f: Failure, a: Analysis, o: { signal: AbortSignal; log: RunLog }): Promise<{ prepared: Prepared; commit?: { sha: string; url: string } }> {
  const { log, signal } = o;
  const paths = new Set(a.tree.map((t) => t.path));
  log.say('info', 'Phase 2 · Locating the affected files');
  for (const item of a.affected) {
    if (signal.aborted) throw new Error('Cancelled.');
    if (item.action === 'create') { log.say('ok', `new file ${item.path}`, item.reason); continue; }
    const p = paths.has(item.path) ? item.path : resolvePaths([item.path], [...paths])[0] ?? item.path;
    const s = log.start('cmd', `git show ${f.branch}:${p}`);
    const fresh = await readFile(token, f.repo, p, f.branch);
    if (fresh === null) { log.fail(s, 'could not be read'); continue; }
    const changed = a.files[p] !== undefined && a.files[p] !== fresh;
    a.files[p] = fresh;
    log.done(s, changed ? 'changed since the analysis; using the latest' : `${fresh.split('\n').length} lines · ${item.reason || item.action}`);
  }
  log.say('info', 'Phase 3 · Understanding the error');
  let plan = '';
  try {
    const files = a.affected.map((x) => `- ${x.action} ${x.path}: ${x.reason}`).join('\n');
    const inputs = a.affected.map((x) => (a.files[x.path] !== undefined ? `=== ${x.path} ===\n${a.files[x.path].slice(0, 12_000)}` : '')).filter(Boolean).join('\n\n');
    plan = (await askAgent({ signal, log, role: 'planning the fix', system: PLAN_SYSTEM, prompt: `Repository ${f.repo}@${f.branch}\nError:\n${f.error.slice(0, 2500)}\n\nDiagnosis:\n${a.note.slice(0, 5000)}\n\nFiles to change:\n${files}\n\n${inputs}` })).text;
    log.say('ok', 'plan ready', plan.split('\n').find((l) => l.trim())?.slice(0, 120));
  } catch (e) { if (e instanceof Error && e.message === 'Cancelled.') throw e; log.say('warn', 'planning step skipped', msg(e).slice(0, 120)); }
  log.say('info', 'Phase 4 · Writing the corrected code');
  const prepared = await prepareFix(token, f, a, { signal, log, plan });
  if (prepared.failed.length || !prepared.changes.length) { log.say('err', 'nothing was committed', prepared.failed.length ? 'a file could not be fixed safely' : 'no change was produced'); return { prepared }; }
  log.say('info', 'Phase 5 · Committing to the repository');
  const commit = await commitFix(token, f, prepared, { log });
  log.say('ok', `fix committed · ${commit.sha.slice(0, 7)}`, `${prepared.changes.length} file${prepared.changes.length === 1 ? '' : 's'} on ${f.branch}`);
  return { prepared, commit };
}
