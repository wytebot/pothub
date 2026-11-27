// GitHub access shared by the Deployments page, Codelab, the analysis chat and the Ask MonyGist repo picker.
// The token lives only on this device (secure storage on the phone, browser storage on the web).
import { Capacitor } from '@capacitor/core';
import { requestSite } from '../security/api';
import agentWorkflowTemplate from '../../.github/workflows/monygist-agent.yml?raw';
import agentScriptTemplate from '../../scripts/monygist-agent.mjs?raw';
import { notifyDone } from '../notify';

export type Repo = { id: number; name: string; full_name: string; private: boolean; default_branch: string; description?: string };
export type TreeItem = { path: string; type: 'blob' | 'tree'; sha: string; size?: number; mode?: string };
export type FileChange = { path: string; content: string | null };
export type Run = { id: number; name: string; title: string; status: string; conclusion: string | null; branch: string; sha: string; url: string; number: number; created: string; event: string };
export type Step = { name: string; status: string; conclusion: string | null; number: number };
export type Job = { id: number; name: string; status: string; conclusion: string | null; steps: Step[] };
export type GhDeployment = { id: number; env: string; ref: string; sha: string; created: string; state: string; target: string; log: string };

const API = 'https://api.github.com';
export const GH_SESSION = 'pothub.github.session';
export const GH_STATE = 'pothub.github.state';
export const GH_OAUTH = 'pothub.github.oauth';
const NATIVE_KEY = 'pothub.github.token';

export async function loadGithubToken(): Promise<string> {
  try {
    if (Capacitor.isNativePlatform()) { const { SecureStorage } = await import('@aparajita/capacitor-secure-storage'); const v = await SecureStorage.get(NATIVE_KEY); return typeof v === 'string' ? v : ''; }
    return localStorage.getItem(GH_SESSION) || '';
  } catch { return ''; }
}
export async function saveGithubToken(token: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) { const { SecureStorage } = await import('@aparajita/capacitor-secure-storage'); await SecureStorage.set(NATIVE_KEY, token); } else localStorage.setItem(GH_SESSION, token);
  } catch { throw new Error('Could not save the GitHub session on this device.'); }
}
export async function clearGithubToken(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) { const { SecureStorage } = await import('@aparajita/capacitor-secure-storage'); await SecureStorage.remove(NATIVE_KEY); } else localStorage.removeItem(GH_SESSION);
  } catch { /* nothing to clear */ }
}

const enc = encodeURIComponent;
const encPath = (p: string) => p.split('/').map(enc).join('/');

export async function github<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init?.headers || {}) } });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { message?: string };
    let hint = '';
    if (r.status === 401) hint = ' The GitHub session expired; reconnect GitHub.';
    else if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') { const reset = Number(r.headers.get('x-ratelimit-reset')); hint = reset ? ` Rate limit resets at ${new Date(reset * 1000).toLocaleTimeString()}.` : ' GitHub rate limit reached.'; }
    else if (r.status === 403) hint = ' The GitHub session may lack permission for this repository.';
    else if (r.status === 404) hint = ' Check the repository, branch or path.';
    else if (r.status === 409) hint = ' The repository changed; refresh and retry.';
    else if (r.status === 422) hint = ' GitHub rejected this change; check branch rules.';
    throw new Error(`${j.message || `GitHub request failed (${r.status})`}${hint}`);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

export function from64(text: string): string { const bin = atob(text.replace(/\n/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); }

/** A repository path that stays inside the repository. */
export function safePath(path: string): string {
  const p = path.trim().replace(/^\/+/, '');
  if (!p || p.split('/').some((x) => !x || x === '.' || x === '..')) throw new Error(`"${path}" is not a valid repository path.`);
  return p;
}

export const whoami = (token: string) => github<{ login: string }>(token, '/user');

/** The signed-in person's repositories, newest activity first. Free accounts see their 10 most recent. */
export async function listRepos(token: string): Promise<Repo[]> {
  let pro = false;
  try { pro = (await requestSite<{ premium?: boolean }>('/api/billing/status')).premium === true; } catch { /* guests and offline are treated as free */ }
  if (!pro) return (await github<Repo[]>(token, '/user/repos?per_page=10&sort=updated')).slice(0, 10);
  const all: Repo[] = [];
  for (let page = 1; page <= 10; page++) { const part = await github<Repo[]>(token, `/user/repos?per_page=100&sort=updated&page=${page}`); all.push(...part); if (part.length < 100) break; }
  return all;
}

export async function listBranches(token: string, full: string): Promise<string[]> {
  return (await github<{ name: string }[]>(token, `/repos/${full}/branches?per_page=100`)).map((b) => b.name);
}

export async function getTree(token: string, full: string, ref: string): Promise<{ tree: TreeItem[]; truncated: boolean }> {
  const t = await github<{ tree: TreeItem[]; truncated?: boolean }>(token, `/repos/${full}/git/trees/${enc(ref)}?recursive=1`);
  return { tree: t.tree.filter((x) => x.type === 'blob').sort((a, b) => a.path.localeCompare(b.path)), truncated: !!t.truncated };
}

/** One text file at a branch or commit. Returns null for binary or missing files. */
export async function readFile(token: string, full: string, path: string, ref: string): Promise<string | null> {
  try {
    const d = await github<{ content?: string; encoding?: string }>(token, `/repos/${full}/contents/${encPath(path)}?ref=${enc(ref)}`);
    if (typeof d.content !== 'string') return null;
    const text = d.encoding === 'base64' ? from64(d.content) : d.content;
    return text.includes('\u0000') ? null : text;
  } catch { return null; }
}

/**
 * Commits every change in ONE commit on `branch` (Git data API): new and edited files replace the old ones, a null content deletes the file.
 * Throws before anything is written if the branch moved while the change was being prepared.
 */
export async function commitFiles(token: string, full: string, branch: string, changes: FileChange[], message: string, modes: Record<string, string> = {}): Promise<{ sha: string; url: string }> {
  if (!changes.length) throw new Error('There is nothing to commit.');
  const ref = await github<{ object: { sha: string } }>(token, `/repos/${full}/git/ref/heads/${encPath(branch)}`);
  const base = await github<{ tree: { sha: string } }>(token, `/repos/${full}/git/commits/${ref.object.sha}`);
  const entries: { path: string; mode: string; type: 'blob'; sha: string | null }[] = [];
  const json = { 'Content-Type': 'application/json' };
  for (let i = 0; i < changes.length; i += 4) {
    const part = changes.slice(i, i + 4);
    entries.push(...await Promise.all(part.map(async (c) => {
      const path = safePath(c.path);
      if (c.content === null) return { path, mode: '100644', type: 'blob' as const, sha: null };
      const blob = await github<{ sha: string }>(token, `/repos/${full}/git/blobs`, { method: 'POST', headers: json, body: JSON.stringify({ content: c.content, encoding: 'utf-8' }) });
      return { path, mode: modes[path] || '100644', type: 'blob' as const, sha: blob.sha };
    })));
  }
  const tree = await github<{ sha: string }>(token, `/repos/${full}/git/trees`, { method: 'POST', headers: json, body: JSON.stringify({ base_tree: base.tree.sha, tree: entries }) });
  const commit = await github<{ sha: string; html_url: string }>(token, `/repos/${full}/git/commits`, { method: 'POST', headers: json, body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }) });
  await github(token, `/repos/${full}/git/refs/heads/${encPath(branch)}`, { method: 'PATCH', headers: json, body: JSON.stringify({ sha: commit.sha }) });
  void notifyDone({ kind: 'text', title: 'GitHub commit successful', body: `Committed ${changes.length} change${changes.length === 1 ? '' : 's'} to ${full} (${branch}).`, route: '/deployments' });
  return { sha: commit.sha, url: commit.html_url };
}

export async function listRuns(token: string, full: string, branch?: string): Promise<Run[]> {
  const j = await github<{ workflow_runs: { id: number; name: string; display_title?: string; status: string; conclusion: string | null; head_branch: string; head_sha: string; html_url: string; run_number: number; created_at: string; event: string }[] }>(token, `/repos/${full}/actions/runs?per_page=8${branch ? `&branch=${enc(branch)}` : ''}`);
  return j.workflow_runs.map((r) => ({ id: r.id, name: r.name, title: r.display_title || r.name, status: r.status, conclusion: r.conclusion, branch: r.head_branch, sha: r.head_sha, url: r.html_url, number: r.run_number, created: r.created_at, event: r.event }));
}
export async function runJobs(token: string, full: string, runId: number): Promise<Job[]> {
  const j = await github<{ jobs: { id: number; name: string; status: string; conclusion: string | null; steps?: Step[] }[] }>(token, `/repos/${full}/actions/runs/${runId}/jobs?per_page=30`);
  return j.jobs.map((x) => ({ id: x.id, name: x.name, status: x.status, conclusion: x.conclusion, steps: x.steps ?? [] }));
}
/** The text log of one job. GitHub answers with a redirect to a signed file; if the browser cannot follow it, the caller falls back to step names. */
export async function jobLog(token: string, full: string, jobId: number): Promise<string> {
  const r = await fetch(`${API}/repos/${full}/actions/jobs/${jobId}/logs`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`Job log unavailable (${r.status}).`);
  return await r.text();
}
export const rerunFailed = (token: string, full: string, runId: number) => github<void>(token, `/repos/${full}/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' });

export async function listDeployments(token: string, full: string): Promise<GhDeployment[]> {
  const list = await github<{ id: number; environment: string; ref: string; sha: string; created_at: string }[]>(token, `/repos/${full}/deployments?per_page=6`);
  return await Promise.all(list.map(async (d) => {
    let state = 'pending'; let target = ''; let log = '';
    try { const s = (await github<{ state: string; target_url?: string; log_url?: string; environment_url?: string }[]>(token, `/repos/${full}/deployments/${d.id}/statuses?per_page=1`))[0]; if (s) { state = s.state; target = s.environment_url || s.target_url || ''; log = s.log_url || s.target_url || ''; } } catch { /* status unknown */ }
    return { id: d.id, env: d.environment, ref: d.ref, sha: d.sha, created: d.created_at, state, target, log };
  }));
}

/** Install the repo-owned MonyGist worker only when absent; existing user workflow/script files are never overwritten. */
export async function ensureMonyGistAgent(token: string, full: string, branch?: string): Promise<{ installed: boolean; branch: string }> {
  const repo = await github<Repo>(token, `/repos/${full}`); const ref = branch || repo.default_branch;
  const getFile = async (file: string): Promise<{ sha: string; text: string } | null> => { try { const d = await github<{ sha: string; content: string; encoding: string }>(token, `/repos/${full}/contents/${encPath(file)}?ref=${enc(ref)}`); return { sha: d.sha, text: d.encoding === 'base64' ? from64(d.content) : d.content }; } catch (e) { if (e instanceof Error && /404|Not Found/i.test(e.message)) return null; throw e; } };
  const putFile = async (file: string, content: string, existing: { sha: string; text: string } | null) => { const bytes = new TextEncoder().encode(content); let binary=''; for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); const body={message:`Install MonyGist cloud agent (${file})`,content:btoa(binary),branch:ref,...(existing?{sha:existing.sha}:{})}; await github<void>(token, `/repos/${full}/contents/${encPath(file)}`, { method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) }); };
  const workflowPath='.github/workflows/monygist-agent.yml', scriptPath='scripts/monygist-agent.mjs'; const workflow=await getFile(workflowPath), script=await getFile(scriptPath);
  if(workflow && !workflow.text.includes('node scripts/monygist-agent.mjs')) throw new Error('This repository already has a different monygist-agent.yml workflow. It was not overwritten; review it or rename the workflow before requesting a cloud repair.');
  if(script && !script.text.includes('MonyGist managed cloud coding runner')) throw new Error('A non-MonyGist script already exists at scripts/monygist-agent.mjs. It was not overwritten or executed. Review/remove it before enabling the cloud agent.');
  if(!script) await putFile(scriptPath,agentScriptTemplate,null);
  if(!workflow) await putFile(workflowPath,agentWorkflowTemplate,null);
  return { installed: !workflow || !script, branch: ref };
}
/** Dispatch the repo-owned cloud repair workflow. It runs even after the mobile/web app closes. */
export async function dispatchMonyGistAgent(token: string, full: string, task: string, branch?: string): Promise<{ queued: true; installed: boolean }> {
  const repo = full.split('/'); if (repo.length !== 2 || repo.some((x) => !/^[A-Za-z0-9_.-]+$/.test(x))) throw new Error('Invalid repository identifier.');
  const clean = task.trim(); if (!clean || clean.length > 12_000) throw new Error('Agent task must be between 1 and 12,000 characters.');
  const setup = await ensureMonyGistAgent(token,full,branch); const ref=setup.branch;
  await requestSite<{ queued: boolean }>('/api/agent/cloud-dispatch', { repo: full, branch: ref, task: clean, githubToken: token }, 30_000);
  return { queued: true, installed: setup.installed };
}
/** Dispatch a repository-owned workflow with workflow_dispatch, after validating the workflow identifier and branch. */
export async function dispatchGithubWorkflow(token: string, full: string, workflow: string, branch?: string): Promise<void> {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(workflow) || workflow.includes('..')) throw new Error('Invalid workflow filename or ID.');
  if (branch && !/^[A-Za-z0-9_./-]{1,120}$/.test(branch)) throw new Error('Invalid branch name.');
  const ref = branch || (await github<Repo>(token, `/repos/${full}`)).default_branch;
  await github<void>(token, `/repos/${full}/actions/workflows/${enc(workflow)}/dispatches`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }) });
}

const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/i;
const SECRETISH = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|AUTH|CERT|COOKIE)/i;
/** Writes a GitHub Actions repository variable, never a secret; rejects secret-like variable names. */
export async function setGithubRepoVariable(token: string, full: string, name: string, value: string): Promise<void> {
  if (!VARIABLE_NAME.test(name) || SECRETISH.test(name)) throw new Error('Variable name is invalid or looks sensitive. Use GitHub Secrets for sensitive values.');
  if (value.length > 5000) throw new Error('Repository variable value exceeds 5,000 characters.');
  const body = JSON.stringify({ name, value });
  const route = `/repos/${full}/actions/variables/${enc(name)}`;
  try { await github<void>(token, route, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }); }
  catch (e) { if (!(e instanceof Error) || !/404|Not Found/i.test(e.message)) throw e; await github<void>(token, `/repos/${full}/actions/variables`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); }
}
