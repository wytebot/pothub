import test from 'node:test';
import assert from 'node:assert/strict';
import {klingAuthorizationHeader} from '../server/video-adapters.js';

test('Kling adapter uses the documented Bearer API-key authorization scheme',()=>{
  assert.equal(klingAuthorizationHeader('kling_api_key'),'Bearer kling_api_key');
});
