import { describe, expect, it } from 'vitest';
import { codeContext, detectCodeWork } from './codeWork';
import { systemPrompt, wantedOutput } from './deliver';
import { interpret } from '../models/router';
import { bundleName } from './fileNames';

const files = { hasFiles: true };
const task = (p: string, c = files) => detectCodeWork(p, c)?.task ?? null;

describe('code work requests are recognised', () => {
  it('fix', () => {
    for (const p of ['fix it', 'Fix this', 'fix the code', 'please fix it', 'pls fix', 'just fix it', 'can you fix it?', 'fix it for me', 'fix them', 'fix everything', 'fix all the bugs', 'resolve the errors', 'repair it', 'patch it', 'solve it', 'go ahead and fix it', 'fix the bugs in the login page', 'it is not working', "it doesn't work", 'this is broken', 'the app crashes on login', 'make it work', 'get it working', 'get it to run', 'send me the fixed code', 'give me the corrected files', 'apply the fixes', 'I tried running it but it crashes. Fix it', 'Fix the code and send me the zip']) expect(task(p), p).toBe(p.includes('debug') ? 'debug' : 'fix');
  });
  it('debug', () => {
    for (const p of ['debug it', 'debug the code', 'debug this', 'debug', 'find and fix the bugs', 'find the bugs']) expect(task(p), p).toBe('debug');
    expect(task('troubleshoot it')).toBe('fix'); expect(task('diagnose the issue')).toBe('fix');
  });
  it('wire', () => {
    for (const p of ['wire it', 'wire it up', 'wire the app', 'wire everything', 'hook it up', 'connect everything', 'connect the frontend to the backend', 'integrate it']) expect(task(p), p).toBe('wire');
  });
  it('build', () => {
    for (const p of ['build the app', 'build it', 'build this', 'build the project', 'build everything', 'build the whole thing', 'make the app', 'create the app', 'develop the app', 'code it', 'implement it', 'finish it', 'finish the app', 'complete the project', 'continue building', 'start building', 'start coding', 'build me a todo app', 'create a website for my bakery']) expect(task(p), p).toBe('build');
  });
  it('improve', () => {
    for (const p of ['improve the code', 'refactor it', 'optimize the code', 'clean up the code', 'upgrade the app', 'update the code', 'make it production ready', 'make it better']) expect(task(p), p).toBe('upgrade');
  });
  it('does not take other requests for code work', () => {
    for (const p of ['how do I fix a flat tire?', 'fix my sleep schedule', 'fix the typo in this sentence', 'fix my grammar', 'fix this essay', 'what does debug mean', 'explain the code', 'build a pot icon', 'create an app icon', 'make a poster', 'wire transfer fees', 'build muscle fast', 'build a habit', 'how to debug this', 'can you explain how to fix it', 'write a poem', 'summarise this file', 'improve my resume', 'update my cv', 'make it shorter', 'fix the leaky tap', 'build a brand', 'create a logo for my app']) expect(task(p), p).toBeNull();
  });
});

describe('it only counts when there is something to work on', () => {
  it('needs files, code in the chat, or code pasted in the message', () => {
    for (const p of ['fix it', 'fix the code', 'debug it', 'wire it', 'build it', 'improve the code', 'make it work']) expect(detectCodeWork(p, {}), p).toBeNull();
    expect(detectCodeWork('fix it\nTypeError: x is not a function\n  at foo (a.js:1:2)', {})?.task).toBe('fix');
    expect(detectCodeWork('fix it', { afterCode: true })?.task).toBe('fix');
  });
  it('building from the request needs nothing attached', () => {
    for (const p of ['build the app', 'build me a todo app', 'create a website for my bakery']) expect(detectCodeWork(p, {})?.task, p).toBe('build');
  });
  it('"yes" and "do it" mean go only when the last reply offered the changes', () => {
    const h = [{ role: 'user' as const, text: 'my react app shows a blank page' }, { role: 'assistant' as const, text: 'The cause is a missing key. Would you like me to fix it?' }];
    const c = codeContext(h);
    expect(c).toEqual({ hasFiles: false, afterCode: true, offered: true });
    for (const p of ['do it', 'go ahead', 'yes', 'yes please', 'proceed']) expect(detectCodeWork(p, c)?.via, p).toBe('confirm');
    for (const p of ['do it', 'go ahead', 'yes']) expect(detectCodeWork(p, { afterCode: true }), p).toBeNull();
    expect(codeContext([{ role: 'user', text: 'what is the capital of Ghana' }, { role: 'assistant', text: 'Accra.' }]).afterCode).toBe(false);
  });
});

describe('what the app does with it', () => {
  it('delivers a zip, whatever else the wording says, and tells the model how to work', () => {
    for (const p of ['fix it', 'debug the code', 'wire it', 'build the app', 'fix the code and download it']) {
      const w = wantedOutput(p, files); expect(w.format, p).toBe('zip'); expect(w.file).toBe(true); expect(w.code).toBeTruthy();
    }
    expect(wantedOutput('fix it and zip it', files).code).toBe('fix');
    const sp = systemPrompt(wantedOutput('wire it', files));
    expect(sp).toContain('WIRE-UP'); expect(sp).toContain('FIXES.md'); expect(sp).toContain('=== FILE:');
  });
  it('leaves everything else alone', () => {
    expect(wantedOutput('fix it').format).toBe('chat');                  // no context given: unchanged
    expect(wantedOutput('explain DNS', files).format).toBe('chat');
    expect(wantedOutput('debug it and give me a pdf report', files).format).toBe('pdf');
    expect(systemPrompt(wantedOutput('explain DNS', files))).not.toContain('Code task');
  });
  it('sends short code requests to the text model, not the picture model', () => {
    for (const p of ['fix it', 'wire it', 'make it work', 'get it working', 'it is not working', 'finish it', 'hook it up', 'build the app']) {
      expect(interpret(p, { code: { afterCode: true } }).task, p).toBe('text');
    }
    expect(interpret('A futuristic city skyline at golden hour', { hasFiles: false }).task).toBe('text');
  });
  it('names the zip for what it holds', () => {
    const z = [{ name: 'pothub-main-fixed__2_.zip' }];
    expect(bundleName({ prompt: 'wire it', inputs: z })).toBe('pothub wired version');
    expect(bundleName({ prompt: 'fix it', inputs: z })).toBe('pothub fixed version');
    expect(bundleName({ prompt: 'build the app', inputs: z })).toBe('pothub source code');
    expect(bundleName({ prompt: 'debug the code', inputs: z })).toBe('pothub fixed version');
  });
});
