/** Fetch the authenticated identity and first repository page concurrently. */
export async function fetchGithubRepositoryBootstrap(fetchJson, firstPagePath) {
  if (typeof fetchJson !== 'function') throw new TypeError('A GitHub JSON fetcher is required.');
  if (typeof firstPagePath !== 'string' || !firstPagePath.startsWith('/user/repos?')) throw new TypeError('A valid first repository page path is required.');
  const [identity, firstPage] = await Promise.all([fetchJson('/user'), fetchJson(firstPagePath)]);
  if (!identity?.data?.id || !identity?.headers) throw new Error('GitHub did not return the authenticated account identity.');
  if (!Array.isArray(firstPage?.data)) throw new Error('GitHub returned an invalid first repository page.');
  return { identity, firstPage };
}

/** Discover every repository visible to the authenticated GitHub OAuth token. */
export async function discoverGithubRepositories(fetchPage, maxPages = 10, firstPage = null) {
  if (typeof fetchPage !== 'function') throw new TypeError('A GitHub repository page fetcher is required.');
  const limit = Math.max(1, Math.min(10, Number(maxPages) || 10));
  const first = firstPage ?? await fetchPage(1);
  if (!Array.isArray(first)) throw new Error('GitHub returned an invalid repository list.');
  // Fetch later pages concurrently after page one confirms pagination is needed.
  // This cuts multi-page discovery latency from N round trips to one bounded batch.
  const pages = [first];
  if (first.length >= 100 && limit > 1) {
    const later = await Promise.all(Array.from({ length: limit - 1 }, (_, index) => fetchPage(index + 2)));
    for (const rows of later) {
      if (!Array.isArray(rows)) throw new Error('GitHub returned an invalid repository list.');
      pages.push(rows);
      if (rows.length < 100) break;
    }
  }
  const byId = new Map();
  for (const rows of pages) for (const repo of rows) {
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
  const repos = [...byId.values()].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return {
    repos,
    count: repos.length,
    hasMore: repos.length >= limit * 100,
    note: repos.length ? '' : 'No repositories are visible to this GitHub authorization. Check organization access and SSO authorization.',
  };
}
