import crypto from 'node:crypto';

export const config = { api: { bodyParser: false, externalResolver: true } };
export default async function githubRepos(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET to load repositories.', code: 'METHOD_NOT_ALLOWED', requestId }); }
  try {
    const { getSession } = await import('../../../server/lib.js');
    const session = await getSession(req);
    if (!session?.user?.id || !session.githubToken || session.authProvider === 'google') return res.status(401).json({ error: 'Your GitHub Developer session is missing or expired. Sign in with GitHub again, then refresh repositories.', code: 'GITHUB_SESSION_REQUIRED', requestId });
    const all = [];
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`;
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${session.githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = response.status === 401 ? 401 : response.status === 403 ? 403 : 502;
        const message = response.status === 401 ? 'GitHub rejected the saved session. Sign in with GitHub again.' : response.status === 403 ? 'GitHub rate-limited this request or denied repository access. Wait briefly and retry; confirm the OAuth app has repository access.' : `GitHub repository request failed (HTTP ${response.status}).`;
        return res.status(status).json({ error: message, code: response.status === 401 ? 'GITHUB_TOKEN_REJECTED' : response.status === 403 ? 'GITHUB_ACCESS_DENIED' : 'GITHUB_API_ERROR', requestId });
      }
      if (!Array.isArray(data)) throw new Error('GitHub returned an unexpected repository response.');
      all.push(...data);
      if (data.length < 100) break;
    }
    const repos = all.map(r => ({ id: r.id, name: r.name, full_name: r.full_name, owner: { login: r.owner?.login || '' }, html_url: r.html_url, private: !!r.private, description: r.description || '', language: r.language || null, default_branch: r.default_branch || 'main', updated_at: r.updated_at || null }));
    return res.status(200).json({ ok: true, repos, count: repos.length, requestId, note: repos.length ? `Loaded ${repos.length} repositories from GitHub.` : 'GitHub returned no repositories for this account. Check the OAuth app repository permissions or organization access.' });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const message = timedOut ? 'GitHub took too long to return repositories. Check your connection and retry.' : String(error?.message || 'Unexpected repository loading error.').slice(0, 240);
    console.error('[Pothub GitHub repos]', JSON.stringify({ requestId, message }));
    return res.status(timedOut ? 504 : 500).json({ error: message, code: timedOut ? 'GITHUB_REPOS_TIMEOUT' : 'GITHUB_REPOS_INTERNAL', requestId, hint: 'Open /api/health and check Vercel Function logs using this request ID.' });
  }
}
