// Pure helpers for the Vercel page: environment-variable drafts, validation, links, and the "fix this build" prompt.

// Faded suggestions only. They are shown as placeholders and are NEVER written into a field for the person.
const NAME_HINTS = ['DATABASE_URL', 'API_KEY', 'SECRET_KEY', 'NEXT_PUBLIC_API_URL', 'NODE_ENV', 'JWT_SECRET', 'STRIPE_SECRET_KEY'];
const VALUE_HINTS = ['postgres://user:password@host:5432/db', 'paste the key here', 'a long random secret', 'https://api.example.com', 'production', 'a long random string', 'sk_live_…'];
export const placeholdersFor = (index = 0) => ({ name: NAME_HINTS[index % NAME_HINTS.length], value: VALUE_HINTS[index % VALUE_HINTS.length] });

export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export const ALL_TARGETS = ['production', 'preview', 'development'];

let counter = 0;
export const newRow = () => ({ id: `row${Date.now().toString(36)}${(counter++).toString(36)}`, key: '', value: '', sensitive: true, saved: false });
export const startRows = () => [newRow()];

/** Problem with one row, or ''. Empty rows are not a problem, they are simply ignored. */
export function rowProblem(row, allRows = []) {
  const key = String(row?.key || '').trim(), value = String(row?.value || '');
  if (!key && !value) return '';
  if (!key) return 'Add a name for this variable.';
  if (!ENV_NAME.test(key)) return 'Use letters, numbers and underscores, and do not start with a number.';
  if (!value) return 'Add a value for this variable.';
  if (value.length > 10000) return 'This value is too long (10,000 characters at most).';
  if (key.startsWith('NEXT_PUBLIC_') && row.sensitive) return 'NEXT_PUBLIC_ variables are visible in the browser, so mark this one non-sensitive.';
  if (allRows.some((r) => r !== row && !r.saved && String(r.key || '').trim() === key)) return 'Another row already uses this name.';
  return '';
}

/** Rows still waiting to be saved that actually contain something. */
export const pendingRows = (rows) => (rows || []).filter((r) => !r.saved && (String(r.key || '').trim() || r.value));
export function firstProblem(rows) { for (const r of pendingRows(rows)) { const p = rowProblem(r, rows); if (p) return p; } return ''; }
export const toPayload = (rows) => pendingRows(rows).map((r) => ({ key: String(r.key).trim(), value: String(r.value), secret: !!r.sensitive }));

/** After a save: filled rows turn into compact saved rows (value dropped from memory) and one fresh row is added. */
export function markSaved(rows, keys) {
  const done = new Set(keys || []);
  const next = (rows || []).filter((r) => r.saved || String(r.key || '').trim() || r.value).map((r) => (!r.saved && done.has(String(r.key).trim()) ? { ...r, value: '', saved: true } : r));
  return [...next, newRow()];
}

export const toggleTarget = (targets, t) => (targets.includes(t) ? targets.filter((x) => x !== t) : [...targets, t]);

/** Link to this project's environment variables on vercel.com. */
export function envDashboardUrl(project) {
  if (!project) return 'https://vercel.com/dashboard';
  return project.teamSlug
    ? `https://vercel.com/${encodeURIComponent(project.teamSlug)}/${encodeURIComponent(project.name)}/settings/environment-variables`
    : `https://vercel.com/dashboard/project/${encodeURIComponent(project.id)}/settings/environment-variables`;
}

/** The domain Vercel assigned. New projects have no alias yet, so the default <name>.vercel.app is used until Vercel reports one. */
export function assignedDomain(project) {
  const known = (project?.domains || []).find(Boolean);
  if (known) return { domain: String(known), confirmed: true };
  return project?.name ? { domain: `${String(project.name).toLowerCase()}.vercel.app`, confirmed: false } : { domain: '', confirmed: false };
}

/** The server tags an error with this code only when Vercel itself asked for verification (sometimes with a code it emails). That happens on Vercel's own page. Ordinary 401/403/permission/scope errors are shown as plain errors, never as this prompt. */
export const VERCEL_REAUTH_CODE = 'VERCEL_REAUTH_REQUIRED';
export const needsVercelReauth = (error) => String(error?.code || '') === VERCEL_REAUTH_CODE;

export const BUILDING = ['QUEUED', 'INITIALIZING', 'BUILDING'];
export const stateOf = (d) => String(d?.state || d?.readyState || '').toUpperCase();
export const isBuilding = (state) => BUILDING.includes(String(state || '').toUpperCase());
export const isFailed = (state) => ['ERROR', 'FAILED', 'CANCELED'].includes(String(state || '').toUpperCase());
export const isReady = (state) => String(state || '').toUpperCase() === 'READY';
export const stateLabel = (state) => ({ QUEUED: 'Queued', INITIALIZING: 'Starting', BUILDING: 'Building', READY: 'Ready', ERROR: 'Failed', FAILED: 'Failed', CANCELED: 'Canceled' }[String(state || '').toUpperCase()] || 'Unknown');

/** Message that goes into the repo chat when a build fails: the repo, the build, the logs and a clear request. */
export function fixBuildPrompt({ repo, branch, project, deploymentId, logs, max = 12000 }) {
  const tail = String(logs || '').trim().slice(-max);
  return [
    `Fix the failed Vercel build for ${repo}${branch ? ` (branch ${branch})` : ''}${project ? `, project ${project}` : ''}.`,
    'Find the first real error in the build logs, explain the root cause, and fix it in the repository files. Check syntax and run the build or tests if you can. Then return a ZIP that contains only the changed files, with repository-relative paths, so I can commit it with the Commit ZIP to GitHub button.',
    deploymentId ? `Deployment: ${deploymentId}` : '',
    '',
    'Build logs:',
    '```text',
    tail || '(Vercel returned no build log lines.)',
    '```',
  ].filter((x, i) => x !== '' || i === 3).join('\n');
}

/** The GitHub repository a Vercel project is linked to, as owner/name, or ''. */
export const linkedRepo = (project) => { const l = project?.link; if (!l) return ''; if (l.repo && String(l.repo).includes('/')) return String(l.repo); return l.org && l.repo ? `${l.org}/${l.repo}` : ''; };

/** GitHub status from the repo-list call: only an explicit "GitHub account required" means "not connected". */
export function githubStatusFrom({ error, data } = {}) {
  if (error) {
    const msg = String(error?.message || error || '');
    return /GITHUB_ACCOUNT_REQUIRED|connect github|developer github|sign in with your developer github/i.test(msg) || error?.code === 'GITHUB_ACCOUNT_REQUIRED' ? 'missing' : 'error';
  }
  return Array.isArray(data?.repos || data?.repositories) ? 'connected' : 'error';
}

/** The address Vercel really assigned (custom domain first, else the production alias), or '' when none is known yet. */
export const assignedUrl = (project) => { const d = (project?.domains || []).find(Boolean); return d ? `https://${String(d).replace(/^https?:\/\//, '')}` : ''; };

const AI_PROVIDERS = 'GEMINI|GOOGLE|OPENAI|AZURE_OPENAI|ANTHROPIC|CLAUDE|MISTRAL|GROQ|DEEPSEEK|XAI|GROK|OPENROUTER|COHERE|PERPLEXITY|TOGETHER|FIREWORKS|HF|HUGGINGFACE|REPLICATE|STABILITY|FAL|BFL|RUNWAY|LUMA|KLING|ELEVENLABS|CUSTOM_AI|VERTEX|BEDROCK';
const AI_NAME = new RegExp(`(^|_)(${AI_PROVIDERS})(_|$)|(^|_)(AI|LLM|MODEL|MODELS|FALLBACK_MODELS|AGENT_MAP)(_|$)|^POTHUB_(AI|BACKEND)`);
const NOT_AI = /^(NEXT_PUBLIC_FIREBASE|FIREBASE|GOOGLE_CLIENT|GOOGLE_APPLICATION|GOOGLE_OAUTH|GOOGLE_ANALYTICS|VERCEL_|GITHUB_|STRIPE|FLUTTERWAVE|SESSION_|FLW_)/;
/** True for variables that configure an AI provider: provider keys, model names, fallbacks and PotHub's AI map. */
export const isAiVariable = (key) => { const k = String(key || '').toUpperCase(); return !!k && !NOT_AI.test(k) && AI_NAME.test(k); };
