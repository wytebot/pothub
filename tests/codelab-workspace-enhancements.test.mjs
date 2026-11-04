import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Codelab workspace exposes multi-file tabs, quick open, global search, symbol outline and split view', async () => {
  const project = await read('src/ui/codelab/pages/Project.jsx');
  assert.match(project, /workspaceFileTabs/);
  assert.match(project, /Go to file/);
  assert.match(project, /Repository search & replace/);
  assert.match(project, /Symbol outline/);
  assert.match(project, /Split editor/);
  assert.match(project, /setOpenTabs/);
  assert.match(project, /saveState\(key, \{ branch, files, fileIndex, base, baseSha, selected, openTabs, history/);
});

test('Codelab AI actions pass repository, branch, file and selection context without silent apply', async () => {
  const project = await read('src/ui/codelab/pages/Project.jsx');
  const app = await read('src/ui/App.jsx');
  for (const action of ['Explain selected code','Fix selected code','Refactor selected code','Write tests for selected code','Add comments to selected code']) assert.ok(project.includes(action));
  assert.match(project, /Show the diff and wait for explicit approval before applying anything/);
  assert.match(app, /context\?\.prompt\|\|base/);
});

test('PR, repository delete and revert are credit-charged while bulk file deletion is not', async () => {
  const app = await read('server/app.js');
  assert.match(app, /wytelabCharge=.*oneCreditMutation\('Create pull request'\)/);
  assert.match(app, /wytelabCharge=.*oneCreditMutation\('Revert repository'\)/);
  assert.match(app, /api\/github\/delete-repo',oneCreditMutation\('Delete GitHub repository'\)/);
  assert.match(app, /api\/github\/delete-files',async\(req,res\)=>/);
  assert.doesNotMatch(app, /api\/github\/delete-files',oneCreditMutation/);
});

test('Codelab UI and GitHub port no longer gate PR/revert/delete behind WyteLab Pro', async () => {
  const project = await read('src/ui/codelab/pages/Project.jsx');
  const github = await read('server/wytelab-github.js');
  assert.doesNotMatch(project, /plan!=="pro"|PRO_REQUIRED|WyteLab Pro/);
  assert.doesNotMatch(github, /PRO_REQUIRED|WyteLab Pro|plan!=="pro"/);
});
