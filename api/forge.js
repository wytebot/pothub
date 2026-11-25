import { applyCors, bodyOf, limited, reply } from './_lib/http.js';
import { verifyIdToken } from './_lib/auth.js';

const fail = (req, res, status, error) => reply(req, res, status, { error });
const cleanRef = (value) => String(value || '').trim().slice(0, 100);
export function parsePublicGithubUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
  if (parts.length !== 2 || !/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) return null;
  return `${parts[0]}/${parts[1]}`;
}
export const isPremium = (who) => {
  const c = who?.claims || who?.customClaims || {};
  const rawUntil = Number(c.pothubProUntil || 0);
  const until = rawUntil > 1e11 ? rawUntil : rawUntil * 1000;
  const premiumFlag = c.premium === true || c.pothubPro === true || c.plan === 'pro' || c.pothubPlan === 'pro';
  return premiumFlag && (!until || until > Date.now());
};
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { applyCors(req, res); res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') return fail(req, res, 405, 'POST only.');
  try {
    const who = await verifyIdToken(req.headers.authorization);
    if (!who) return fail(req, res, 401, 'Sign in again to run Forge.');
    if (!isPremium(who)) return fail(req, res, 403, 'APK, AAB and web build jobs are a Premium feature. Upgrade to Premium to use Pothub Forge.');
    if (limited(`forge-dispatch:${who.uid}`, 2)) return fail(req, res, 429, 'Forge dispatch limit reached: maximum 2 requests per rolling minute. Wait at least one minute and retry.');
    const body = bodyOf(req) || {};
    const repository = parsePublicGithubUrl(body.repositoryUrl);
    if (!repository) return fail(req, res, 400, 'Enter a public GitHub repository URL (https://github.com/owner/repo).');
    const projectType = ['auto', 'node', 'flutter', 'android', 'react-native', 'capacitor'].includes(body.projectType) ? body.projectType : 'auto';
    const output = ['auto', 'web', 'apk', 'apk-and-aab'].includes(body.output) ? body.output : 'auto';
    const ref = cleanRef(body.ref);
    if (ref && (!/^[A-Za-z0-9._\/-]+$/.test(ref) || ref.startsWith('-') || ref.includes('..') || ref.includes('//'))) return fail(req, res, 400, 'Branch, tag, or commit contains unsupported characters.');
    const repo = String(process.env.POTHUB_FORGE_REPOSITORY || '').trim();
    const token = String(process.env.POTHUB_FORGE_GITHUB_TOKEN || '').trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !token) return fail(req, res, 503, 'Forge dispatch is not configured. Set POTHUB_FORGE_REPOSITORY and POTHUB_FORGE_GITHUB_TOKEN on the backend.');
    const apiHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const check = await fetch(`https://api.github.com/repos/${repository}`, { headers: apiHeaders, signal: AbortSignal.timeout(8000) });
    if (!check.ok) return fail(req, res, 400, 'Repository could not be verified as public. Check its URL and visibility.');
    const meta = await check.json();
    if (meta.private !== false) return fail(req, res, 400, 'Forge currently accepts public repositories only.');
    const dispatch = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/pothub-forge-free-worker.yml/dispatches`, {
      method: 'POST', headers: { ...apiHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: String(process.env.POTHUB_FORGE_BRANCH || 'main'), inputs: { repository, ref, project_type: projectType, output } }), signal: AbortSignal.timeout(10000),
    });
    if (dispatch.status !== 204) {
      const detail = dispatch.status === 404 ? 'Forge workflow not found. Install the Pothub Forge workflow in the configured repository.' : dispatch.status === 403 ? 'GitHub token needs Actions write permission on the Pothub Forge repository.' : `GitHub dispatch failed (${dispatch.status}).`;
      return fail(req, res, 502, detail);
    }
    return reply(req, res, 202, { status: 'queued', repository, projectType, output, workflowUrl: `https://github.com/${repo}/actions`, message: 'Forge build workflow dispatched. Download the artifact from the Actions run; direct Pothub delivery is not yet available.' });
  } catch (e) {
    return fail(req, res, 502, e?.name === 'TimeoutError' ? 'Forge dispatch timed out. Try again shortly.' : 'Forge dispatch failed unexpectedly. Try again shortly.');
  }
}
