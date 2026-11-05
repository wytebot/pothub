export function validateGithubRepoAccess({ scopes = [], githubUserId, sessionUserId, linkedGithubUserId } = {}) {
  const normalized = new Set((Array.isArray(scopes) ? scopes : String(scopes || '').split(',')).map(x => String(x).trim()).filter(Boolean));
  if (!normalized.has('repo') && !normalized.has('public_repo')) {
    return { ok: false, status: 403, code: 'GITHUB_REPO_SCOPE_MISSING', reconnect: true, message: 'Your GitHub authorization does not include repository access. Reconnect GitHub and approve the requested repository permissions.' };
  }
  // A linked GitHub identity is distinct from the PotHub account ID. Compare
  // the token's /user identity with the identity recorded when OAuth was linked.
  const expectedGithubId = linkedGithubUserId || sessionUserId;
  if (!githubUserId || !expectedGithubId || String(githubUserId) !== String(expectedGithubId)) {
    return { ok: false, status: 403, code: 'GITHUB_ACCOUNT_MISMATCH', reconnect: true, message: 'The GitHub token does not belong to the linked GitHub account. Reconnect the intended GitHub account.' };
  }
  return { ok: true };
}
