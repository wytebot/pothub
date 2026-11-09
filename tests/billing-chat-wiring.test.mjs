import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINEERING_MODES, engineeringProtocol, RESPONSE_FLOW_RULES, HONESTY_RULES } from '../server/engineering-protocol.js';
import { responseStyleFragment } from '../server/response-styles.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const server = read('server/app.js'), lib = read('server/lib.js'), app = read('src/ui/App.jsx'), ws = read('src/ui/WorkspaceSection.jsx');

test('every protocol mode lets the request decide the reply shape, and explicit formats win', () => {
  for (const mode of ENGINEERING_MODES) assert.ok(engineeringProtocol(mode).includes(RESPONSE_FLOW_RULES), mode);
  assert.match(RESPONSE_FLOW_RULES, /never reuse one template for every reply/);
  assert.match(RESPONSE_FLOW_RULES, /Do NOT open every reply with/);
  assert.match(RESPONSE_FLOW_RULES, /vary the structure and wording/);
  assert.match(RESPONSE_FLOW_RULES, /put it in the text box/);
  assert.match(RESPONSE_FLOW_RULES, /always wins over these defaults/);
  assert.ok(engineeringProtocol('chat').indexOf(HONESTY_RULES) < engineeringProtocol('chat').indexOf(RESPONSE_FLOW_RULES));
});

test('the debug style works from evidence to cause instead of leading with the cause', () => {
  const f = responseStyleFragment('Debug this error');
  assert.match(f, /most likely cause/);
  assert.doesNotMatch(f, /Lead with the most likely cause/);
  assert.match(f, /Start from the evidence/);
});

test('server: plan orders reuse the verified order flow and activate a subscription', () => {
  assert.match(server, /const PACKS=\{\.\.\.Object\.fromEntries\(PRICING_PACKS\.map\(p=>\[p\.id,p\]\)\),\.\.\.PLAN_ORDER_PACKS\}/);
  assert.match(server, /const planDef=planForPackId\(order\?\.pack_id\);\s*if\(planDef\)\{/);
  assert.match(server, /activatePlanPayment\(String\(order\.github_id\),planDef\.plan,String\(order\.reference\)\)/);
  assert.match(server, /app\.get\('\/api\/billing\/status'/);
  assert.match(server, /daily_limit_reached'\?\{limit:e\.limit,used:e\.used,resetsAt:e\.resetsAt\}/);
});

test('server: every charge function goes through the quota guard; the old credit RPCs are no longer used for charging', () => {
  for (const fn of ['spendCredits', 'reserveCredits', 'spendCreditsOnce']) assert.match(lib, new RegExp(`export async function ${fn}\\([^)]*\\)\\{[^]*?agentQuotaGuard\\(id,`), fn);
  assert.match(lib, /export async function commitCreditReservation[^\n]*return\{ok:true,duplicate:true,state:'committed'\}/);
  assert.match(lib, /export async function releaseCreditReservation[^\n]*refundAgentAction\(firestore/);
  assert.match(lib, /if\(!isAgentAction\(reason\)\)return\{unlimited:true/);
});

test('client: billing replaces credits in the pill and the modal', () => {
  assert.match(app, /aria-label="Plan and billing"/);
  assert.match(app, /<h2>Billing<\/h2>/);
  assert.doesNotMatch(app, /<h2>Credits<\/h2>/);
  assert.doesNotMatch(app, /\{credits\} credits<\/button>/);
  assert.match(app, /\/api\/billing\/status/);
  assert.match(app, /dispatchEvent\(new Event\('pothub:plan-changed'\)\)/);
  assert.match(app, /Plans do not renew automatically/);
});

test('client: agent requests pause and resume with the same idempotency key', () => {
  assert.match(app, /import \{pauseKindFor,waitForResume\} from '\.\.\/lib\/job-pause\.js'/);
  assert.match(app, /RESUMABLE_PATH=\/\^\\\/api\\\/\(agent\|developer\|codelab\|github\|diagnose\|repair\|creator\)\//);
  assert.match(app, /if\(idempotencyKey&&RESUMABLE_PATH\.test\(path\)\)\{const kind=pauseKindFor\(e,\{signal:externalSignal\}\)/);
  assert.match(app, /async function apiStream\(path,opts=\{\},onToken=\(\)=>\{\}\)\{[^]*?apiStreamOnce\(path,opts,onToken\)/);
  assert.match(app, /<JobPauseBanner onUpgrade=/);
  assert.match(app, /d\?\.code==='daily_limit_reached'&&d\?\.error/);
});

test('client: repo button opens one persistent chat per repo in the normal chat', () => {
  assert.match(app, /const openRepoAI=async\(r,context=\{\}\)=>/);
  assert.match(app, /rows\.find\(c=>c\.repo===full\)/);
  assert.match(app, /repo:full,repoBranch:/);
  assert.match(app, /await openChat\(row\.id\)/);
  assert.doesNotMatch(app, /pothub:open-repo-ai-chat/);
  assert.doesNotMatch(ws, /pothub:open-repo-ai-chat/);
  assert.doesNotMatch(ws, /className="panel edit-workspace"/);
});

test('client: @ file mentions exist only for repo chats and attach file contents on send', () => {
  assert.match(ws, /enabled:!!chatRepo/);
  assert.match(ws, /<RepoMentionPicker/);
  assert.match(ws, /if\(mentions\.onKeyDown\(e\)\)return;/);
  assert.match(app, /if\(repoRow\?\.repo\)\{[^]*appRepoFiles\.attachmentsFor\(repoRow\.repo,branchName,toolResult\?'':text,\{pin:repoPin\}\)/);
  assert.match(app, /attachments:\[\.\.\.repoExtra,\.\.\.attachmentPayload\]\.map/);
});

test('client: chunks are prefetched after sign-in, off the critical path', () => {
  assert.match(app, /requestIdleCallback/);
  assert.match(app, /import\('\.\/WorkspaceSection'\)\.catch/);
});

test('billing status tells the operator whether and why an account is free-forever', () => {
  assert.match(lib, /freeForeverReason:free\?\.reason\|\|null,freeForeverConfigured:freeForeverConfigured\(\)/);
});

test('the Vercel redirect diagnostics list every candidate source, mark the winner and flag hidden whitespace or quotes', () => {
  assert.match(server, /function vercelRedirectCandidates\(req\)/);
  assert.match(server, /candidates:vercelRedirectCandidates\(req\)/);
  assert.match(server, /hasHiddenWhitespaceOrQuotes/);
  const start = server.indexOf('function vercelRedirectCandidates(req)'), body = server.slice(start, server.indexOf('function vercelRedirectUri(req)', start));
  const order = ['VERCEL_REDIRECT_URI_OVERRIDE', 'VERCEL_REDIRECT_URI', 'POTHUB_API_ORIGIN', 'APP_URL'].map((n) => body.indexOf(`['${n}',process.env.${n}`));
  assert.ok(order.every((i) => i > 0) && order.every((v, i, a) => !i || v > a[i - 1]), 'candidate order must match the real precedence');
});
