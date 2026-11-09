/**
 * Free-forever accounts: PotHub never charges credits to these accounts.
 *
 * What this does NOT do: PotHub is BYOK-only (see agent-mode-policy.js). Free-forever removes PotHub's
 * own credit charges. It does not pay a model provider for the account; the account still uses its own API keys.
 *
 * Matching rules (deliberately strict, because a loose match here is a free-credits hole):
 *  - Google-provider accounts match ONLY on the email address stored from the server-verified Google/Firebase
 *    token. The profile's github_login for those accounts is "google:<uid>".
 *  - GitHub-provider accounts match ONLY on the numeric GitHub id (the profile document id) or on the GitHub login
 *    that GitHub's OAuth returned. They are never matched by email.
 *  - Comparison is exact (case-insensitive). No Gmail dot/plus normalisation and no substring matching.
 *
 * Weakness to know about: a GitHub LOGIN can change hands (rename, delete and re-register). The numeric id cannot.
 * Look up the id for each login (https://api.github.com/users/<login> → "id") and put it in
 * POTHUB_FREE_FOREVER_GITHUB_IDS so the grant stays tied to the account rather than the name.
 */

// Nothing is hard-coded. Accounts come only from the POTHUB_FREE_FOREVER_* environment variables.
export const FREE_FOREVER_DEFAULTS = Object.freeze({
  emails: Object.freeze([]),
  githubLogins: Object.freeze([]),
  githubIds: Object.freeze([]),
});

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const list = (value) => String(value || '')
  .split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Defaults plus the optional POTHUB_FREE_FOREVER_* environment variables, normalised. */
export function freeForeverConfig(env = process.env) {
  return {
    emails: new Set([...FREE_FOREVER_DEFAULTS.emails, ...list(env?.POTHUB_FREE_FOREVER_EMAILS)].map((x) => x.toLowerCase())),
    githubLogins: new Set([...FREE_FOREVER_DEFAULTS.githubLogins, ...list(env?.POTHUB_FREE_FOREVER_GITHUB_LOGINS)].map((x) => x.toLowerCase())),
    githubIds: new Set([...FREE_FOREVER_DEFAULTS.githubIds, ...list(env?.POTHUB_FREE_FOREVER_GITHUB_IDS)].map(String)),
  };
}

const lc = (v) => String(v ?? '').trim().toLowerCase();

/**
 * Why an account is free-forever, or null. Checks every identity attached to the account:
 *  - profile: Google email (google: accounts) or GitHub id/login (GitHub accounts);
 *  - linked: the GitHub account connected to the account (OAuth-verified), by numeric id or login. Never by email.
 * @param {{github_login?:string,email?:string}|null} profile  stored profile row
 * @param {string} userId  profile document id (the GitHub numeric id for GitHub accounts)
 * @param {{githubId?:string|number,login?:string}|null} linked  stored GitHub connection
 * @returns {'google-email'|'github-id'|'github-login'|'linked-github-id'|'linked-github-login'|null}
 */
export function freeForeverMatch(profile, userId, linked = null, config = freeForeverConfig()) {
  if (profile && typeof profile === 'object') {
    const login = String(profile.github_login || '').trim();
    if (/^google:/i.test(login)) {
      const email = lc(profile.email);
      if (email && config.emails.has(email)) return 'google-email';
    } else if (GITHUB_LOGIN.test(login)) {
      if (config.githubIds.has(String(userId || ''))) return 'github-id';
      if (config.githubLogins.has(login.toLowerCase())) return 'github-login';
    }
  }
  if (linked && typeof linked === 'object') {
    if (linked.githubId != null && config.githubIds.has(String(linked.githubId))) return 'linked-github-id';
    const login = String(linked.login || '').trim();
    if (GITHUB_LOGIN.test(login) && config.githubLogins.has(login.toLowerCase())) return 'linked-github-login';
  }
  return null;
}

export const isFreeForeverProfile = (profile, userId, config = freeForeverConfig()) => freeForeverMatch(profile, userId, null, config) !== null;

/** True when at least one free-forever account is configured. Used only to tell the operator when nothing is set. */
export function freeForeverConfigured(config = freeForeverConfig()) {
  return config.emails.size + config.githubLogins.size + config.githubIds.size > 0;
}
