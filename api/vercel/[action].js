// Read-only bridge to the Vercel REST API for the Repositories page, running on Vercel.
// Routes (all POST, JSON body with the person's own Vercel access token):
//   /api/vercel/projects     -> the projects the token can see (personal scope + teams)
//   /api/vercel/deployments  -> the latest deployments of one project
//   /api/vercel/events       -> the build log of one deployment
//   /api/vercel/env-list|env-create|env-update|env-delete -> project environment variable CRUD
// The token is used for this one request and is never stored or logged. Only api.vercel.com is ever contacted.
import { bodyOf, clientIp, limited, reply } from '../_lib/http.js';

const API = 'https://api.vercel.com';
const ID = /^[A-Za-z0-9_\-.]{1,128}$/;
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const clean = (s) => String(s ?? '').replace(ANSI, '').replace(/\r/g, '');
const safeError = (e) => String(e instanceof Error ? e.message : e || 'unknown error').replace(/Bearer\s+[A-Za-z0-9_\-.]+/gi, '[redacted]').slice(0, 180);

async function vercel(token, path, team) {
  const u = new URL(`${API}${path}`);
  if (team) u.searchParams.set('teamId', team);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j?.error?.message || `Vercel answered ${r.status}`); e.status = r.status; throw e;
  }
  return j;
}

const project = (p, team) => ({
  id: p.id, name: p.name, team: team || '', framework: p.framework || '',
  repo: p.link?.type === 'github' && p.link.org && p.link.repo ? `${p.link.org}/${p.link.repo}` : '',
});

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return reply(req, res, 204, {});
  if (req.method !== 'POST') return reply(req, res, 405, { error: 'Use POST.' });
  const action = String(req.query?.action || '');
  if (limited(`vc:${clientIp(req)}`, 60)) return reply(req, res, 429, { error: 'Too many requests. Wait a minute and try again.' });
  const b = bodyOf(req);
  const token = String(b.token || '').trim();
  if (!token || token.length > 512 || /\s/.test(token)) return reply(req, res, 400, { error: 'Paste a valid Vercel access token.' });
  const team = b.team ? String(b.team) : '';
  if (team && !ID.test(team)) return reply(req, res, 400, { error: 'Invalid team.' });
  try {
    if (action === 'projects') {
      const out = []; const seen = new Set();
      const add = (list, t) => { for (const p of list || []) if (!seen.has(p.id)) { seen.add(p.id); out.push(project(p, t)); } };
      add((await vercel(token, '/v9/projects?limit=100')).projects, '');
      let teams = []; try { teams = (await vercel(token, '/v2/teams?limit=50')).teams || []; } catch { /* a token scoped to one team cannot list teams */ }
      for (const t of teams.slice(0, 10)) { try { add((await vercel(token, '/v9/projects?limit=100', t.id)).projects, t.id); } catch { /* skip a team this token cannot read */ } }
      return reply(req, res, 200, { projects: out });
    }
    if (action === 'deployments') {
      const pid = String(b.projectId || ''); if (!ID.test(pid)) return reply(req, res, 400, { error: 'Invalid project.' });
      const j = await vercel(token, `/v6/deployments?projectId=${encodeURIComponent(pid)}&limit=10`, team);
      return reply(req, res, 200, { deployments: (j.deployments || []).map((d) => ({
        id: d.uid, url: d.url || '', state: d.readyState || d.state || '', target: d.target || '', created: d.created || d.createdAt || 0,
        ready: d.ready || 0, sha: d.meta?.githubCommitSha || '', message: String(d.meta?.githubCommitMessage || '').split('\n')[0].slice(0, 160),
        branch: d.meta?.githubCommitRef || '', repo: d.meta?.githubOrg && d.meta?.githubRepo ? `${d.meta.githubOrg}/${d.meta.githubRepo}` : '',
      })) });
    }
    if (action === 'events') {
      const id = String(b.deploymentId || ''); if (!ID.test(id)) return reply(req, res, 400, { error: 'Invalid deployment.' });
      const j = await vercel(token, `/v3/deployments/${encodeURIComponent(id)}/events?builds=1&direction=forward&limit=-1`, team);
      const list = Array.isArray(j) ? j : j.events || [];
      const lines = list.map((e) => ({ t: e.created || e.date || 0, type: String(e.type || ''), text: clean(e.text ?? e.payload?.text ?? '') })).filter((l) => l.text.trim());
      return reply(req, res, 200, { lines: lines.slice(-3000) });
    }
    if (action === 'env-list') {
      const projectId = String(b.projectId || ''); if (!ID.test(projectId)) return reply(req, res, 400, { error: 'Invalid project.' });
      const u = new URL(`${API}/v10/projects/${encodeURIComponent(projectId)}/env`); if (team) u.searchParams.set('teamId', team); u.searchParams.set('limit', '100');
      const r = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); const j = await r.json().catch(() => ({}));
      if (!r.ok) { const er = new Error(j?.error?.message || `Vercel answered ${r.status}`); er.status = r.status; throw er; }
      return reply(req, res, 200, { variables: (j.envs || []).map(v => ({ id: v.id, key: v.key, type: v.type || 'plain', targets: v.target || [], createdAt: v.createdAt || 0, updatedAt: v.updatedAt || 0, comment: v.comment || '' })) });
    }
    if (action === 'env-create' || action === 'env-update') {
      const projectId = String(b.projectId || ''); const name = String(b.name || ''); const value = String(b.value ?? ''); const type = ['plain','secret','encrypted'].includes(String(b.type)) ? String(b.type) : 'secret';
      const targets = Array.isArray(b.targets) ? b.targets.filter(x => ['production','preview','development'].includes(x)) : ['production','preview','development'];
      if (!ID.test(projectId) || !/^[A-Z_][A-Z0-9_]{0,63}$/i.test(name) || !targets.length) return reply(req, res, 400, { error: 'Invalid environment variable request.' });
      const envId = String(b.envId || ''); if (action === 'env-update' && !ID.test(envId)) return reply(req, res, 400, { error: 'Invalid variable id.' });
      const u = new URL(`${API}/v10/projects/${encodeURIComponent(projectId)}/env${action === 'env-update' ? `/${encodeURIComponent(envId)}` : ''}`); if (team) u.searchParams.set('teamId', team);
      const r = await fetch(u, { method: action === 'env-update' ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ key: name, value, type, target: targets, ...(b.comment ? { comment: String(b.comment).slice(0, 256) } : {}) }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { const er = new Error(j?.error?.message || `Vercel answered ${r.status}`); er.status = r.status; throw er; }
      return reply(req, res, 200, { saved: true, variable: { id: j.id || envId, key: j.key || name, type: j.type || type, target: j.target || targets } });
    }
    if (action === 'env-delete') {
      const projectId = String(b.projectId || ''); const envId = String(b.envId || ''); if (!ID.test(projectId) || !ID.test(envId)) return reply(req, res, 400, { error: 'Invalid project or variable id.' });
      const u = new URL(`${API}/v10/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(envId)}`); if (team) u.searchParams.set('teamId', team);
      const r = await fetch(u, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!r.ok) { const j = await r.json().catch(() => ({})); const er = new Error(j?.error?.message || `Vercel answered ${r.status}`); er.status = r.status; throw er; }
      return reply(req, res, 200, { deleted: true });
    }
    if (action === 'variables') {
      const projectId = String(b.projectId || ''); const name = String(b.name || ''); const value = String(b.value ?? '');
      const targets = Array.isArray(b.targets) ? b.targets.filter(x => ['production','preview','development'].includes(x)) : ['production','preview','development'];
      if (!ID.test(projectId) || !/^[A-Z_][A-Z0-9_]{0,63}$/i.test(name) || /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|AUTH|CERT|COOKIE)/i.test(name) || value.length > 5000 || !targets.length) return reply(req, res, 400, { error: 'Invalid or sensitive variable. This endpoint accepts non-sensitive plain variables only.' });
      const u = new URL(`${API}/v10/projects/${encodeURIComponent(projectId)}/env`); if (team) u.searchParams.set('teamId', team);
      const r = await fetch(u, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ key: name, value, type: 'plain', target: targets }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { const er = new Error(j?.error?.message || `Vercel answered ${r.status}`); er.status = r.status; throw er; }
      return reply(req, res, 200, { saved: true, name });
    }
    return reply(req, res, 404, { error: 'Unknown route.' });
  } catch (e) {
    const status = Number(e?.status) || 502;
    const hint = status === 401 || status === 403 ? 'Vercel refused this token: it is invalid or expired, or it is not allowed to read deployments.' : safeError(e);
    return reply(req, res, status === 401 || status === 403 ? 401 : 502, { error: hint });
  }
}
