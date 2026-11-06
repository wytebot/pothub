import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildOutputFile, archiveEntries, isBinaryOnlyFormat, TEXT_OUTPUT_FORMATS } from '../src/lib/output-files.js';
import { classifyRequest } from '../src/lib/request-intent.js';
import { outputFormatInstruction } from '../server/output-format-prompts.js';

const unzip = async (data) => Object.values((await JSZip.loadAsync(data)).files).filter(f => !f.dir).map(f => f.name);

test('zip: explicit file= names, path= names and a path line above a fence', async () => {
  const reply = '```js file=src/a.js\nlet a=1\n```\n\n**lib/b.py**\n```python\nprint(1)\n```\n\n```CODEBLOCK path=NEW:docs/c.md language=md\n# c\n```';
  assert.deepEqual(archiveEntries(reply).map(f => f.name), ['src/a.js', 'lib/b.py', 'docs/c.md']);
  const out = await buildOutputFile('zip', reply, { title: 'demo' });
  assert.equal(out.name, 'demo.zip');
  assert.deepEqual((await unzip(out.data)).sort(), ['README.md', 'docs/c.md', 'lib/b.py', 'src/a.js']);
});

test('zip: unnamed fences get language-based names and plain text still becomes a zip', async () => {
  assert.deepEqual(archiveEntries('```ts\nx\n```\n```css\ny\n```').map(f => f.name), ['file-1.ts', 'file-2.css']);
  const out = await buildOutputFile('zip', 'Just an essay with no code.', { title: 'essay' });
  assert.ok((await unzip(out.data)).includes('response.md'));
});

test('zip: path traversal is neutralised and large files are not dropped', async () => {
  const big = 'x'.repeat(3 * 1024 * 1024);
  const out = await buildOutputFile('zip', '```txt file=../../etc/passwd\nroot\n```\n```txt file=big.txt\n' + big + '\n```');
  const names = await unzip(out.data);
  assert.ok(names.includes('etc/passwd') && names.includes('big.txt'));
  assert.ok(!names.some(n => n.includes('..')));
});

test('source and text formats are delivered verbatim under the requested extension', async () => {
  for (const [format, fence, body] of [['java', 'java', 'class A{}'], ['go', 'go', 'package main'], ['toml', 'toml', 'a = 1'], ['rs', 'rust', 'fn main(){}'], ['kt', 'kotlin', 'fun main(){}'], ['ps1', 'powershell', 'Write-Host hi'], ['jsonl', 'jsonl', '{"a":1}\n{"a":2}']]) {
    const out = await buildOutputFile(format, `Here you go\n\`\`\`${fence}\n${body}\n\`\`\`\nDone.`, { title: 't' });
    assert.equal(out.name, `t.${format}`); assert.equal(out.data, body + '\n');
  }
  assert.equal((await buildOutputFile('dockerfile', '```dockerfile\nFROM node\n```')).data, 'FROM node\n');
});

test('tsv, svg and rtf are generated', async () => {
  assert.equal((await buildOutputFile('tsv', '| a | b |\n|---|---|\n| 1 | 2 |')).data, 'a\tb\r\n1\t2\r\n');
  const svg = await buildOutputFile('svg', 'x\n```svg\n<svg viewBox="0 0 1 1"><rect/></svg>\n```');
  assert.match(svg.data, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox/);
  assert.equal(await buildOutputFile('svg', 'no markup here'), null);
  const rtf = await buildOutputFile('rtf', '# Title\n\nCafé');
  assert.match(rtf.data, /^\{\\rtf1/); assert.match(rtf.data, /Caf\\u233\?/);
});

test('xlsx falls back to a one-column sheet when there is no table; docx and pptx still build', async () => {
  const x = await buildOutputFile('xlsx', 'first line\nsecond line');
  assert.ok((await unzip(x.data)).includes('xl/workbook.xml'));
  assert.ok((await unzip((await buildOutputFile('docx', '# Hi')).data)).includes('word/document.xml'));
  assert.ok((await unzip((await buildOutputFile('pptx', '## One\n- a\n## Two\n- b')).data)).includes('ppt/presentation.xml'));
});

test('binary media cannot be faked as text; unknown text extensions are still delivered', async () => {
  for (const f of ['png', 'mp3', 'mp4', 'exe', 'rar']) { assert.ok(isBinaryOnlyFormat(f)); assert.equal(await buildOutputFile(f, 'hello'), null); }
  const out = await buildOutputFile('gradle', '```groovy\nplugins{}\n```'); assert.equal(out.name, 'pothub-output.gradle'); assert.equal(out.data, 'plugins{}\n');
  assert.equal(await buildOutputFile('../x', 'hello'), null);
  assert.ok(TEXT_OUTPUT_FORMATS.includes('java') && TEXT_OUTPUT_FORMATS.includes('zip') && TEXT_OUTPUT_FORMATS.includes('pdf'));
});

test('intent recognises the new formats without hijacking ordinary requests', () => {
  const fmt = (t) => classifyRequest(t).fileFormat || '';
  assert.equal(fmt('write a java file that parses csv'), 'java');
  assert.equal(fmt('export this table as tsv'), 'tsv');
  assert.equal(fmt('create a toml file for my config'), 'toml');
  assert.equal(fmt('give me a zip file with the project'), 'zip');
  assert.equal(fmt('make me a pdf report on solar power'), 'pdf');
  assert.equal(fmt('create a go file with a http server'), '');
  assert.equal(fmt('create main.go with a http server'), '');
  assert.equal(fmt('I want a coffee in java please'), '');
  assert.equal(fmt('what is a log file and how do I read it'), '');
});

test('server prompt tells the model how to lay out each format', () => {
  assert.match(outputFormatInstruction('zip'), /file=relative\/path/);
  assert.match(outputFormatInstruction('xlsx'), /Markdown table/);
  assert.match(outputFormatInstruction('pptx'), /## Slide title/);
  assert.match(outputFormatInstruction('java'), /single fenced block/);
});
