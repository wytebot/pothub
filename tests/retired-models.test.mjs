import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfiguredModel} from '../src/lib/provider-registry.js';
test('retired Gemini model IDs saved by older versions are migrated; others untouched',()=>{
  assert.equal(normalizeConfiguredModel('gemini','gemini-2.5-flash-image'),'gemini-3.1-flash-image');
  assert.equal(normalizeConfiguredModel('gemini','models/gemini-2.5-flash'),'gemini-3.6-flash');
  assert.equal(normalizeConfiguredModel('gemini','gemini-3.6-flash'),'gemini-3.6-flash');
  assert.equal(normalizeConfiguredModel('openai','gpt-4.1'),'gpt-4.1');
});
