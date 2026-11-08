import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const server = read('server/app.js'), app = read('src/ui/App.jsx'), shell = read('src/ui/VercelBackendWorkspace.jsx');

test('the environment-variable list reads names, types and targets from Vercel and never returns values', () => {
  const i = server.indexOf("app.get('/api/vercel/environment-variables'"), route = server.slice(i, server.indexOf('\napp.', i + 10) > 0 ? server.indexOf('\napp.', i + 10) : i + 2500);
  assert.ok(i > 0);
  assert.match(route, /\/v10\/projects\/\$\{encodeURIComponent\(projectId\)\}\/env/);
  assert.match(route, /sensitive:\['encrypted','sensitive','secret'\]\.includes/);
  assert.doesNotMatch(route, /value:\s*v\.value|\.value\b/);
});

test('the page has the four sections and the build-to-chat handoff', () => {
  for (const f of ['ImportTab', 'LogsTab', 'VariablesTab', 'AiBackendTab']) assert.match(shell, new RegExp(`from './vercel/${f}\\.jsx'`));
  assert.match(shell, /onDeployed=\{deployed\}/);
  assert.match(shell, /setFocusId\(info\.deploymentId \|\| ''\); setTab\('logs'\)/);
  assert.match(app, /onFixBuild=\{openVercelFix\}/);
  assert.match(app, /function openVercelFix\(\{repoFullName,logs,deploymentId,projectName\}\)/);
  assert.match(app, /prompt:fixBuildPrompt\(\{repo:repoFullName/);
  assert.match(app, /onSwitchGithub=\{\(\)=>login\('github',true\)\}/);
});

test('the ProjectSheet saves pending variables, deploys, then moves to Logs; the env link is in both places', () => {
  const sheet = read('src/ui/vercel/ProjectSheet.jsx'), vars = read('src/ui/vercel/VariablesTab.jsx'), env = read('src/ui/vercel/EnvEditor.jsx');
  assert.match(sheet, /draft\.pending > 0/);
  assert.match(sheet, /\/api\/vercel\/redeploy/);
  assert.match(sheet, /assignedDomain\(project\)/);
  assert.match(env, /dashboardUrl/);
  assert.match(sheet, /dashboardUrl=\{dashboardUrl\}/);
  assert.match(vars, /dashboardUrl=\{url\}/);
  assert.match(sheet, /needsVercelReauth/);
});

test('the logs page polls until the build finishes and offers Fix with AI only for failed builds', () => {
  const logs = read('src/ui/vercel/LogsTab.jsx');
  assert.match(logs, /deployment-status\?deploymentId=/);
  assert.match(logs, /deployment-logs\?deploymentId=/);
  assert.match(logs, /\(!state \|\| isBuilding\(state\)\)\) timer = setTimeout\(tick, 3000\)/);
  assert.match(logs, /isFailed\(state\) && <button[^>]*onClick=\{\(\) => onFix\(/);
});

test('GitHub is not re-requested because of a slow or failed lookup', () => {
  const lib = read('server/lib.js');
  assert.match(lib, /session\.linkedLookupFailed=true/);
  assert.match(server, /linkedUncertain:!!s\.linkedLookupFailed/);
  assert.match(server, /code:'GITHUB_LOOKUP_FAILED'/);
  assert.match(app, /linked-accounts:\$\{user\.id\}/);
  assert.match(app, /!auth\.linkedUncertain/);
  assert.doesNotMatch(app, /\.catch\(\(\)=>\(\{linkedAccounts:\{\}\}\)\)/, 'a failed request no longer counts as "GitHub not connected"');
  assert.match(read('src/ui/vercel/ImportTab.jsx'), /githubStatusFrom/);
});

test('the new stylesheet is actually loaded and covers the sheet, tabs and motion', () => {
  assert.match(read('pages/_app.jsx'), /import '\.\.\/src\/ui\/pothub-ui\.css';/);
  const css = read('src/ui/pothub-ui.css');
  for (const sel of ['.vx-sheet', '.vx-tabs', '.vx-tab-indicator', '.vx-saved-chip', '.vx-log', '.pin-chip', '.agent-steps', '@keyframes vxUp', 'prefers-reduced-motion']) assert.ok(css.includes(sel), sel);
});

test('repo chat ZIPs still offer the GitHub commit button', () => {
  assert.match(read('src/ui/WorkspaceSection.jsx'), /Commit ZIP to GitHub/);
});
