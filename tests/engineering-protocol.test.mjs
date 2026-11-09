import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HONESTY_RULES, HONESTY_RULES_SHORT, DEEP_DIAGNOSIS_PROTOCOL, NO_BREAK_PROTOCOL, STRUCTURED_OUTPUT_NOTE, TECHNICAL_EXECUTION_BRIEF,
  ENGINEERING_MODES, engineeringProtocol, withEngineeringProtocol,
} from '../server/engineering-protocol.js';
import { responseStyleFragment } from '../server/response-styles.js';

const app = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');

test('every mode includes the honesty rules and an unknown mode never throws', () => {
  for (const mode of ENGINEERING_MODES) assert.ok(engineeringProtocol(mode).includes(mode === 'general' ? HONESTY_RULES_SHORT : HONESTY_RULES), mode);
  assert.equal(engineeringProtocol('no-such-mode'), HONESTY_RULES);
  assert.equal(engineeringProtocol(undefined).includes(HONESTY_RULES), true);
});

test('code-changing modes carry the change-safety rules; diagnosing modes carry the diagnosis rules', () => {
  for (const mode of ['patch', 'edit', 'chat']) assert.ok(engineeringProtocol(mode).includes(NO_BREAK_PROTOCOL), mode);
  for (const mode of ['diagnose', 'patch', 'edit', 'readonly', 'chat']) assert.ok(engineeringProtocol(mode).includes(DEEP_DIAGNOSIS_PROTOCOL), mode);
  assert.ok(!engineeringProtocol('diagnose').includes(NO_BREAK_PROTOCOL), 'a diagnosis never implies edits');
});

test('the rules never ask an agent to claim it ran or verified something it cannot', () => {
  const all = [HONESTY_RULES, DEEP_DIAGNOSIS_PROTOCOL, NO_BREAK_PROTOCOL].join(' ');
  assert.match(all, /Never claim to have run, built, tested/);
  assert.match(all, /I don't know|I don\\?'t know/);
  assert.match(all, /CONFIRMED/);
  assert.match(all, /first failure/i);
  assert.match(all, /Never delete, truncate or overwrite working code/);
  assert.match(all, /Never include secrets/);
});

test('withEngineeringProtocol keeps the original prompt first and untouched, and is idempotent', () => {
  const base = 'Return ONLY JSON {"a":1}. Repository x/y.';
  const once = withEngineeringProtocol(base, 'diagnose');
  assert.ok(once.startsWith(base));
  assert.ok(once.includes(STRUCTURED_OUTPUT_NOTE));
  assert.equal(withEngineeringProtocol(once, 'diagnose'), once);
});

test('structured:false (streamed Markdown chat) does not append the JSON-format note', () => {
  const out = withEngineeringProtocol('Answer in Markdown.', 'chat', { structured: false });
  assert.ok(!out.includes(STRUCTURED_OUTPUT_NOTE));
  assert.ok(out.includes(HONESTY_RULES));
});

test('non-string input cannot throw', () => {
  assert.doesNotThrow(() => withEngineeringProtocol(undefined));
  assert.doesNotThrow(() => withEngineeringProtocol(null, 'edit'));
  assert.doesNotThrow(() => withEngineeringProtocol(42, 'patch'));
});

test('the chat debug style keeps its original wording and gains the deeper guidance', () => {
  const fragment = responseStyleFragment('Debug this error');
  assert.match(fragment, /most likely cause/);
  assert.match(fragment, /CONFIRMED, LIKELY or UNKNOWN/);
  assert.match(fragment, /first error/);
});

test('every AI call site in the API wraps its prompt with the protocol', () => {
  assert.match(app, /import \{withEngineeringProtocol,isTechnicalRequest\} from '\.\/engineering-protocol\.js'/);
  const expected = [
    /chargedModelJson\(withEngineeringProtocol\(prompt,'diagnose'\)/,
    /chargedModelJson\(withEngineeringProtocol\(prompt,'patch'\),\{[^}]*reason:'Prepare repair'/,
    /chargedModelJson\(withEngineeringProtocol\(prompt,'edit'\),\{[^}]*reason:'Codelab agent plan'/,
    /chargedModelJson\(withEngineeringProtocol\(plannerPrompt,'readonly'\)/,
    /chargedModelJson\(withEngineeringProtocol\(finalPrompt,'readonly'\)/,
    /chargedModelJson\(withEngineeringProtocol\(prompt,'edit'\),\{[^}]*reason:'Repository-aware Edit chat'/,
    /chargedModelJson\(redactSecrets\(withEngineeringProtocol\(prompt,isTechnicalRequest\(.*?\)\?'chat':'general'\)\),\{[^}]*reason:'Creator chat'/,
    /const fullPrompt=withEngineeringProtocol\(`\$\{prompt\}\\n\\n\$\{CODE_COMPLETENESS_RULES\}`,'chat',\{structured:false\}\)/,
  ];
  for (const re of expected) assert.match(app, re, String(re));
});

test('prompts are wrapped at the call site, never by reassigning a const prompt', () => {
  assert.doesNotMatch(app, /\bprompt=withEngineeringProtocol\(/);
  assert.doesNotMatch(app, /\b(?:plannerPrompt|finalPrompt)=withEngineeringProtocol\(/);
});


test('technical modes require an actionable preflight brief and truthful progress reporting', () => {
  for (const mode of ['diagnose', 'patch', 'edit', 'readonly', 'chat']) {
    assert.ok(engineeringProtocol(mode).includes(TECHNICAL_EXECUTION_BRIEF), mode);
  }
  assert.match(TECHNICAL_EXECUTION_BRIEF, /ordered implementation phases/i);
  assert.match(TECHNICAL_EXECUTION_BRIEF, /Never invent repository reads/i);
  assert.match(TECHNICAL_EXECUTION_BRIEF, /requirement-by-requirement reconciliation/i);
});
