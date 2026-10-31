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


test('GitHub identity and first repository page are fetched concurrently', async () => {
  const {fetchGithubRepositoryBootstrap}=await import('../server/github-repositories.js');
  const calls=[];
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  const fetchJson=async path=>{calls.push(path);if(calls.length===2)release();await gate;return path==='/user'?{data:{id:7,login:'owner'},headers:new Headers({'x-oauth-scopes':'repo'})}:{data:[{id:1,name:'one',owner:{login:'owner'}}],headers:new Headers()};};
  const result=await fetchGithubRepositoryBootstrap(fetchJson,'/user/repos?per_page=100&page=1');
  assert.deepEqual(new Set(calls),new Set(['/user','/user/repos?per_page=100&page=1']));
  assert.equal(result.identity.data.id,7);
  assert.equal(result.firstPage.data.length,1);
});

test('GitHub bootstrap rejects malformed responses rather than rendering an empty list', async () => {
  const {fetchGithubRepositoryBootstrap}=await import('../server/github-repositories.js');
  await assert.rejects(()=>fetchGithubRepositoryBootstrap(async path=>path==='/user'?{data:{id:1},headers:new Headers()}:{data:null,headers:new Headers()},'/user/repos?per_page=100&page=1'),/invalid first repository page/);
});

test('GitHub repository pages are fetched concurrently after a full first page', async () => {
  const started = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const full = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `repo-${i + 1}`, owner: { login: 'owner' } }));
  const pending = discoverGithubRepositories(async page => {
    started.push(page);
    if (page === 1) return full;
    if (started.length === 5) release();
    await gate;
    return page === 2 ? [{ id: 101, name: 'extra', owner: { login: 'owner' } }] : [];
  }, 5);
  const result = await pending;
  assert.deepEqual(started.sort(), [1, 2, 3, 4, 5]);
  assert.equal(result.count, 101);
});
