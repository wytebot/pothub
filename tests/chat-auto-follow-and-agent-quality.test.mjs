import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/ui/WorkspaceSection.jsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/ui/useChatAutoFollow.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
test('Creator chat follows new responses and pauses when reader touches or scrolls up', () => {
  assert.match(workspace, /className="chat-scroll" ref=\{creatorChatFollow\.containerRef\}/);
  assert.match(workspace, /onTouchStart=\{creatorChatFollow\.onTouchStart\}/);
  assert.match(workspace, /onWheel=\{creatorChatFollow\.onWheel\}/);
  assert.match(hook, /followRef\.current=false/);
  assert.match(hook, /scrollHeight-el\.scrollTop-el\.clientHeight<56/);
});
test('Repository chat uses the same reader-controlled auto-follow behavior', () => {
  assert.match(workspace, /className="edit-transcript" ref=\{repoChatFollow\.containerRef\}/);
  assert.match(workspace, /onTouchStart=\{repoChatFollow\.onTouchStart\}/);
  assert.match(workspace, /repoChatFollow\.resume\(\)/);
});
test('Creator and developer agents receive stronger quality and honesty instructions', () => {
  assert.match(server, /highest quality your configured model supports/);
  assert.match(server, /highest quality your configured model supports[\s\S]*?Never invent/);
  assert.match(server, /highly capable, thoughtful general assistant/);
  assert.match(server, /Do not pad answers or claim unsupported facts/);
});
