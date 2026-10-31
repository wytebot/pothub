import test from 'node:test';import assert from 'node:assert/strict';import {setupPin} from '../server/security-lock.js';
test('PIN handler rejects malformed passcodes before touching Firestore',async()=>{await assert.rejects(setupPin('user-1','123'),/6–12 digits/);await assert.rejects(setupPin('user-1','1234567890123'),/6–12 digits/);});
