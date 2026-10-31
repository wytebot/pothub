import test from 'node:test';
import assert from 'node:assert/strict';
import {preprocessLogs,redactProviderError} from '../server/ai-safety.js';

test('log preprocessing strips ANSI, duplicate lines and common progress noise',()=>{
  const input='\u001b[31mERROR: failed build\u001b[0m\nDownloading 40%\nERROR: failed build\n  at build.js:2';
  const out=preprocessLogs(input);
  assert.equal((out.match(/ERROR: failed build/g)||[]).length,1);
  assert.doesNotMatch(out,/Downloading/);
  assert.doesNotMatch(out,/\u001b\[/);
  assert.match(out,/build.js:2/);
});
test('provider errors redact exact secret and bearer values',()=>{
  assert.equal(redactProviderError('bad key sk-secret-value',[ 'sk-secret-value' ]),'bad key [REDACTED]');
  assert.match(redactProviderError('Authorization Bearer abcdefghijklmnopqrstuvwxyz'),/\[REDACTED\]/);
});
