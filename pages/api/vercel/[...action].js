import crypto from 'node:crypto';

export const config = { api: { externalResolver: true }, maxDuration: 60 };
const aliases = () => ({ clientId: String(process.env.VERCEL_CLIENT_ID || process.env.VERCEL_OAUTH_CLIENT_ID || process.env.VERCEL_APP_CLIENT_ID || process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID || '').trim(), clientSecret: String(process.env.VERCEL_CLIENT_SECRET || process.env.VERCEL_OAUTH_CLIENT_SECRET || process.env.VERCEL_APP_CLIENT_SECRET || '').trim() });
function sendError(res, status, error, code, requestId) { return res.status(status).json({ error, code, requestId }); }
async function vercelFetch(token, path) {
  const response = await fetch(`https://api.vercel.com${path}`, { signal: AbortSignal.timeout(18000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? response.status : response.status === 404 ? 404 : 502;
    throw Object.assign(new Error(status === 401 || status === 403 ? 'Vercel denied access. Reconnect Vercel and confirm project/deployment read permissions and team access.' : status === 404 ? 'Vercel project or deployment was not found in the connected account/team.' : `Vercel API request failed (HTTP ${response.status}).`), { status, code: `VERCEL_API_${response.status}` });
  }
  return data;
}
async function tokenFor(req, res, session, sessionFns) {
  if (!session?.vercelAccessToken) throw Object.assign(new Error('Connect your Vercel account first.'), { status: 401, code: 'VERCEL_NOT_CONNECTED' });
  if (Number(session.vercelTokenExpiresAt || 0) > Date.now() + 60000) return session.vercelAccessToken;
  if (!session.vercelRefreshToken) throw Object.assign(new Error('Your Vercel connection expired. Select Connect Vercel and authorize again.'), { status: 401, code: 'VERCEL_RECONNECT_REQUIRED' });
  const { clientId, clientSecret } = aliases();
  if (!clientId || !clientSecret) throw Object.assign(new Error('Vercel OAuth credentials are missing from server environment variables.'), { status: 503, code: 'VERCEL_OAUTH_CONFIG_MISSING' });
  const response = await fetch('https://api.vercel.com/login/oauth/token', { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: session.vercelRefreshToken }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw Object.assign(new Error('Vercel session expired or could not refresh. Connect Vercel again.'), { status: 401, code: 'VERCEL_REFRESH_FAILED' });
  const updated = { ...session, vercelAccessToken: data.access_token, vercelRefreshToken: data.refresh_token || session.vercelRefreshToken, vercelTokenExpiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 - 30000, vercelTeamId: session.vercelTeamId || data.team_id || null };
  if (String(req.headers.cookie || '').includes('pothub_sid=')) await sessionFns.setBrowserSession(res, updated); else await sessionFns.setSession(res, updated);
  return data.access_token;
}
export default async function vercelApi(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId); res.setHeader('Cache-Control', 'no-store, max-age=0');
  const action = Array.isArray(req.query.action) ? req.query.action.join('/') : String(req.query.action || '');
  try {
    const { getSession, setBrowserSession, setSession } = await import('../../../server/lib.js');
    const session = await getSession(req);
    if (action === 'status' && req.method === 'GET') return res.status(200).json({ connected: !!(session?.githubToken && session.authProvider !== 'google' && session.vercelAccessToken), username: session?.vercelUsername || null, requestId });
    if (!session?.user?.id || !session.githubToken || session.authProvider === 'google') return sendError(res, 401, 'Sign in with GitHub as Developer before using Vercel diagnostics.', 'DEVELOPER_SESSION_REQUIRED', requestId);
    if (action === 'disconnect' && req.method === 'POST') {
      const updated = { ...session, vercelAccessToken: null, vercelRefreshToken: null, vercelTokenExpiresAt: 0, vercelUserId: null, vercelUsername: null, vercelTeamId: null };
      if (String(req.headers.cookie || '').includes('pothub_sid=')) await setBrowserSession(res, updated); else await setSession(res, updated);
      return res.status(200).json({ ok: true, requestId });
    }
    const token = await tokenFor(req, res, session, { setBrowserSession, setSession });
    if (action === 'projects' && req.method === 'POST') {
      const personal = await vercelFetch(token, '/v9/projects?limit=100'); let rows = [...(personal.projects || [])];
      try { const teams = await vercelFetch(token, '/v2/teams?limit=100'); for (const team of (teams.teams || []).slice(0, 12)) { try { const result = await vercelFetch(token, `/v9/projects?limit=100&teamId=${encodeURIComponent(team.id)}`); rows.push(...(result.projects || []).map(p => ({ ...p, teamId: p.teamId || team.id, teamName: team.name || null }))); } catch (error) { if (![401,403,404].includes(error.status)) console.warn('[Pothub Vercel team projects]', error.message); } } } catch (error) { if (![401,403,404].includes(error.status)) console.warn('[Pothub Vercel teams]', error.message); }
      const unique = new Map(); for (const p of rows) { const id = String(p.id || ''); if (id) unique.set(`${id}:${p.teamId || ''}`, { id, name: String(p.name || 'Unnamed project'), framework: p.framework || null, updatedAt: p.updatedAt || null, teamId: p.teamId || session.vercelTeamId || null, teamName: p.teamName || null, link: p.link?.type || null }); }
      const projects = [...unique.values()]; return res.status(200).json({ ok: true, projects, count: projects.length, requestId, note: projects.length ? `Loaded ${projects.length} Vercel projects.` : 'No projects were returned. Confirm the authorized Vercel account and team membership.' });
    }
    if (action === 'deployments' && req.method === 'POST') {
      const projectId = String(req.body?.projectId || ''), teamId = String(req.body?.teamId || session.vercelTeamId || '');
      if (!/^[A-Za-z0-9_-]{1,180}$/.test(projectId)) return sendError(res, 422, 'Choose a valid Vercel project first.', 'INVALID_PROJECT_ID', requestId);
      const result = await vercelFetch(token, `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=30${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''}`);
      const deployments = (result.deployments || []).map(x => ({ uid: String(x.uid || x.id || ''), id: String(x.id || x.uid || ''), url: String(x.url || ''), state: String(x.state || x.readyState || x.status || 'unknown'), createdAt: x.createdAt || null, meta: { branch: x.meta?.githubCommitRef || x.meta?.gitBranch || null, commit: x.meta?.githubCommitMessage || x.meta?.githubCommitSha || null } })).filter(x => x.uid);
      return res.status(200).json({ ok: true, deployments, count: deployments.length, requestId });
    }
    if (action === 'logs' && req.method === 'POST') {
      const deploymentId = String(req.body?.deploymentId || ''), teamId = String(req.body?.teamId || session.vercelTeamId || '');
      if (!/^[A-Za-z0-9_-]{1,180}$/.test(deploymentId)) return sendError(res, 422, 'Choose a valid Vercel deployment first.', 'INVALID_DEPLOYMENT_ID', requestId);
      const suffix = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
      const deployment = await vercelFetch(token, `/v13/deployments/${encodeURIComponent(deploymentId)}${suffix}`);
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 16000); let rows = [];
      try { const response = await fetch(`https://api.vercel.com/v3/deployments/${encodeURIComponent(deploymentId)}/events?limit=1000${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ''}`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}`, Accept: 'application/stream+json, application/json' } }); if (!response.ok) throw Object.assign(new Error(`Vercel deployment events request failed (HTTP ${response.status}). Check account permissions and team access.`), { status: response.status === 401 || response.status === 403 ? response.status : 502 }); const body = await response.text(); try { const parsed = JSON.parse(body); rows = Array.isArray(parsed) ? parsed : (parsed.events || parsed.data || []); } catch { rows = body.split('\n').filter(Boolean).slice(0, 1000).map(line => { try { return JSON.parse(line); } catch { return { text: line }; } }); } } finally { clearTimeout(timer); }
      const logs = rows.slice(0, 1000).map(e => { const ts = e.created || e.createdAt || e.date || ''; const n = Number(ts); const date = ts ? new Date(Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : ts) : null; const time = date && !Number.isNaN(date.getTime()) ? date.toISOString() : ''; const type = e.type || e.payload?.type || 'event'; const message = e.text || e.payload?.text || e.payload?.message || e.message || e.payload?.info || ''; return [time, String(type).slice(0, 80), String(message || JSON.stringify(e.payload || {})).slice(0, 1600)].filter(Boolean).join(' | '); }).join('\n').slice(0, 100000);
      return res.status(200).json({ ok: true, deployment: { id: String(deployment.id || deployment.uid || deploymentId), url: String(deployment.url || ''), state: String(deployment.readyState || deployment.state || deployment.status || 'unknown') }, logs, eventCount: rows.length, requestId, note: rows.length ? 'Deployment events loaded. Available event detail depends on Vercel account access.' : 'Vercel returned no deployment events for this deployment.' });
    }
    return sendError(res, 404, `Unknown Vercel API route: ${req.method} /api/vercel/${action}`, 'VERCEL_ROUTE_NOT_FOUND', requestId);
  } catch (error) {
    const status = Number(error?.status) || (error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 504 : 500);
    const message = status === 504 ? 'Vercel did not respond in time. Check your connection and retry.' : String(error?.message || 'Unexpected Vercel server error.').slice(0, 350);
    console.error('[Pothub Vercel API]', JSON.stringify({ requestId, action, status, message }));
    return sendError(res, status, message, error?.code || (status === 504 ? 'VERCEL_TIMEOUT' : `VERCEL_HTTP_${status}`), requestId);
  }
}
