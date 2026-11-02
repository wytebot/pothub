export function validateGithubRepoAccess({ scopes = [], githubUserId, sessionUserId } = {}) {
  const normalized = new Set((Array.isArray(scopes) ? scopes : String(scopes || '').split(',')).map(x => String(x).trim()).filter(Boolean));
  if (!normalized.has('repo') && !normalized.has('public_repo')) {
    return { ok: false, status: 403, code: 'GITHUB_REPO_SCOPE_MISSING', reconnect: true, message: 'Your GitHub authorization does not include repository access. Reconnect GitHub and approve the requested repository permissions.' };
  }
  if (!githubUserId || String(githubUserId) !== String(sessionUserId)) {
    return { ok: false, status: 403, code: 'GITHUB_ACCOUNT_MISMATCH', reconnect: true, message: 'The connected GitHub account changed. Sign out and reconnect the intended account.' };
  }
  return { ok: true };
}
