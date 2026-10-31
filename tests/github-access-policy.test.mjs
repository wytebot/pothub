import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGithubRepoAccess} from '../server/github-access-policy.js';

test('GitHub repository access requires repository scope',()=>{
 const result=validateGithubRepoAccess({scopes:['read:user','read:org'],githubUserId:123,sessionUserId:123});
 assert.equal(result.ok,false);assert.equal(result.code,'GITHUB_REPO_SCOPE_MISSING');assert.equal(result.reconnect,true);
});
test('GitHub repository access rejects a different connected account',()=>{
 const result=validateGithubRepoAccess({scopes:'repo, read:org',githubUserId:456,sessionUserId:123});
 assert.equal(result.ok,false);assert.equal(result.code,'GITHUB_ACCOUNT_MISMATCH');
});
test('GitHub repository access accepts the correct account and repo scope',()=>{
 assert.deepEqual(validateGithubRepoAccess({scopes:['repo','read:org'],githubUserId:'123',sessionUserId:123}),{ok:true});
});
