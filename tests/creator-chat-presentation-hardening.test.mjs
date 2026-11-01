import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/ui/WorkspaceSection.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/ui/styles.css',import.meta.url),'utf8');
test('creator transcript labels user and assistant messages and timestamps safely',()=>{
 assert.match(ui,/creator-message-heading/);
 assert.match(ui,/m\.role===\'assistant\'\?\'PotHub\':\'You\'/);
 assert.match(ui,/Number\.isFinite\(new Date\(m\.createdAt\)\.getTime\(\)\)/);
});
test('creator messages expose working contextual copy, edit, regenerate, and share actions',()=>{
 assert.match(ui,/title="Copy message"/);
 assert.match(ui,/title="Edit and resend this prompt"/);
 assert.match(ui,/title="Regenerate this answer"/);
 assert.match(ui,/title="Share message"/);
 assert.match(ui,/creatorChatFollow\.resume\(\);sendMessage\(prior\.text\|\|''\)/);
});
test('creator transcript styles remain responsive and respect reduced motion',()=>{
 assert.match(css,/\.creator-chat-mode \.creator-message-heading/);
 assert.match(css,/@media\(max-width:760px\)\{\.creator-chat-mode \.creator-message-heading/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.creator-chat-mode \.message-tools button/);
});
