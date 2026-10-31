import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverGithubRepositories} from '../server/github-repositories.js';

test('GitHub repository discovery paginates, deduplicates, and retains private/org repositories', async () => {
  const pages = new Map([
    [1, Array.from({length:100}, (_,i)=>({id:i+1,name:`repo-${i+1}`,full_name:`owner/repo-${i+1}`,owner:{login:'owner'},private:i%2===0,default_branch:'main',updated_at:`2026-10-${String((i%28)+1).padStart(2,'0')}`}))],
    [2, [{id:100,name:'repo-100',full_name:'owner/repo-100',owner:{login:'owner'},private:true,updated_at:'2026-10-31'},{id:101,name:'org-private',full_name:'org/org-private',owner:{login:'org'},private:true,default_branch:'trunk',updated_at:'2026-10-30'}]],
  ]);
  const result = await discoverGithubRepositories(async page => pages.get(page) || []);
  assert.equal(result.count,101);
  assert.equal(result.repos.filter(r=>r.id===100).length,1);
  assert.equal(result.repos.find(r=>r.id===101).private,true);
  assert.equal(result.repos.find(r=>r.id===101).default_branch,'trunk');
});

test('GitHub repository discovery stops at the first short page and caps page count', async () => {
  const seen=[];
  const result=await discoverGithubRepositories(async page=>{seen.push(page);return page===1?[]:[]},99);
  assert.deepEqual(seen,[1]);
  assert.equal(result.count,0);
  assert.match(result.note,/organization access/);
});
