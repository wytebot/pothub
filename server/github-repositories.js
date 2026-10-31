/** Discover every repository visible to the authenticated GitHub OAuth token. */
export async function discoverGithubRepositories(fetchPage, maxPages = 10) {
  if (typeof fetchPage !== 'function') throw new TypeError('A GitHub repository page fetcher is required.');
  const byId = new Map();
  for (let page = 1; page <= Math.max(1, Math.min(10, Number(maxPages) || 10)); page++) {
    const rows = await fetchPage(page);
    if (!Array.isArray(rows)) throw new Error('GitHub returned an invalid repository list.');
    for (const repo of rows) {
      if (!repo?.id || !repo?.owner?.login || !repo?.name) continue;
      byId.set(String(repo.id), {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name || `${repo.owner.login}/${repo.name}`,
        owner: { login: repo.owner.login },
        html_url: repo.html_url || null,
        private: !!repo.private,
        description: repo.description || null,
        language: repo.language || null,
        default_branch: repo.default_branch || 'main',
        updated_at: repo.updated_at || null,
      });
    }
    if (rows.length < 100) break;
  }
  const repos = [...byId.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return {
    repos,
    count: repos.length,
    hasMore: repos.length >= 1000,
    note: repos.length ? '' : 'No repositories are visible to this GitHub authorization. Check organization access and SSO authorization.',
  };
}
