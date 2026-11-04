import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const app=read('../src/ui/App.jsx'),host=read('../src/ui/CodelabWorkspace.jsx'),project=read('../src/ui/codelab/pages/Project.jsx'),server=read('../server/app.js'),gh=read('../src/ui/codelab/github.js');
test('Codelab hosts the WyteLab workspace on the PotHub session',()=>{
  assert.match(host,/from '\.\/codelab\/Codelab'/);
  assert.match(gh,/pot\("\/api\/github\/repos"\)/);
  assert.match(server,/app\.all\('\/api\/wytelab\/\*'/);
});
test('WyteLab menu items are in the PotHub sidebar without the APK partner button',()=>{
  for(const l of ['Repositories','Recent Projects','Changes','Actions','Developer Hub','Logs','Billing','Search','Help','Privacy','Terms','About','Contact','Vercel'])assert.ok(app.includes(l),l);
  assert.doesNotMatch(app,/Build APK/);
});
test('Chat AI leads to the chat area from the sidebar and the edit page',()=>{
  assert.match(app,/openRepoAI\(codelabRepo\)/);
  assert.match(project,/Chat AI/);
  assert.match(project,/codelabContext\(\)\.openAI\?\.\(repo\)/);
});
test('credit-charged Codelab actions are metered',()=>{
  assert.match(server,/oneCreditMutation\('Create pull request'\)/);
  assert.match(server,/oneCreditMutation\('Revert repository'\)/);
});
