import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyRequest, inferRequestedTask } from '../src/lib/request-intent.js';
import { buildOutputFile, markdownToPlain, TEXT_OUTPUT_FORMATS } from '../src/lib/output-files.js';

const img = { type: 'image/png', name: 'a.png' };

test('natural phrasings route to the right media agent with the right confidence', () => {
  const high = [
    ['Hey, please generate a picture of a lion in a suit', 'image'],
    ['Design a poster for a jazz night', 'image'],
    ['Make me a picture of a sunrise', 'image'],
    ['Create a short video of a rocket launch', 'video'],
  ];
  for (const [prompt, task] of high) {
    const r = classifyRequest(prompt);
    assert.equal(r.task, task, prompt);
    assert.equal(r.confidence, 'high', prompt);
  }
  const medium = [
    ['I need a logo for my bakery', 'image'],
    ['I want a picture of mountains at dawn', 'image'],
    ['Show me an image of a futuristic city', 'image'],
    ['give me a photo of a beach', 'image'],
    ['logo for my coffee shop', 'image'],
    ['Paint a sunset over the sea', 'image'],
    ['I need a video for my product launch', 'video'],
  ];
  for (const [prompt, task] of medium) {
    const r = classifyRequest(prompt);
    assert.equal(r.task, task, prompt);
    assert.equal(r.confidence, 'medium', prompt);
  }
});

test('questions, code, analysis and prompt-writing stay with Chat', () => {
  for (const prompt of [
    'How do I generate an image in Python?', 'What is a video codec?', 'Explain how video encoding works',
    'Create a function that resizes images', 'Generate a python script that creates a video',
    'Write a prompt for an image of a dragon', 'Describe this image', 'Draw a conclusion from this data',
    'draw a flowchart of the login flow', 'Write a story about a video game', 'what is in this photo',
  ]) assert.equal(inferRequestedTask(prompt, { attachments: [img] }), 'chat', prompt);
});

test('an attached image plus a motion request becomes the image-to-video chain', () => {
  for (const prompt of ['animate this image', 'Turn this into a video', 'bring this to life']) {
    const r = classifyRequest(prompt, { attachments: [img] });
    assert.deepEqual([r.task, r.chain, r.confidence], ['video', 'image-to-video', 'high'], prompt);
  }
  assert.equal(classifyRequest('animate this image').chain, undefined);
});

test('requested file formats are detected without hijacking the chat route', () => {
  assert.deepEqual(['chat', 'pdf'], [classifyRequest('Create a PDF report of my sales').task, classifyRequest('Create a PDF report of my sales').fileFormat]);
  assert.equal(classifyRequest('Write a summary and give it to me as a docx').fileFormat, 'docx');
  assert.equal(classifyRequest('Make a CSV file of 5 sample customers').fileFormat, 'csv');
  assert.equal(classifyRequest('Explain what a PDF is').fileFormat, undefined);
});

test('output builders produce valid csv/json/docx and refuse to fake unsupported or invalid output', async () => {
  const md = '# Report\n\n| Name | Qty |\n|---|---|\n| Apple, red | 3 |\n| =cmd | 2 |\n\n```json\n{"a":1}\n```\n';
  const csv = await buildOutputFile('csv', md, { title: 'Sales' });
  assert.equal(csv.name, 'sales.csv');
  assert.match(csv.data, /"Apple, red",3/);
  assert.match(csv.data, /'=cmd,2/, 'formula injection neutralised');
  assert.equal(JSON.parse((await buildOutputFile('json', md)).data).a, 1);
  assert.equal(await buildOutputFile('json', 'no json here'), null);
  assert.equal(await buildOutputFile('csv', ''), null);
  const hasJszip = await import('jszip').then(() => true, () => false); // declared dependency; absent only in bare checkouts
  if (hasJszip) {
    const JSZip=(await import('jszip')).default;
    const docx = await buildOutputFile('docx', md, { title: 'r' });
    assert.equal(docx.data[0], 0x50); assert.equal(docx.data[1], 0x4b); // zip magic \"PK\"
    const xlsx=await buildOutputFile('xlsx',md,{title:'Sales'});assert.ok(xlsx);assert.equal(xlsx.data[0],0x50);const xzip=await JSZip.loadAsync(xlsx.data);assert.ok(xzip.file('xl/workbook.xml'));assert.ok(xzip.file('xl/worksheets/sheet1.xml'));
    const pptx=await buildOutputFile('pptx','# Intro\n\n## One\n- first bullet\n\n## Two\n- second bullet',{title:'Presentation'});assert.ok(pptx);const pzip=await JSZip.loadAsync(pptx.data);assert.ok(pzip.file('ppt/presentation.xml'));assert.ok(pzip.file('ppt/slides/slide1.xml'));
    const archive=await buildOutputFile('zip','```js file=src/app.js\nconsole.log(1)\n```',{title:'Source'});assert.ok(archive);const zzip=await JSZip.loadAsync(archive.data);assert.ok(zzip.file('src/app.js'));assert.ok(zzip.file('README.md'));
  }
  assert.equal(markdownToPlain('**bold** and `code`\n- item'), 'bold and code\n• item');
  assert.ok(TEXT_OUTPUT_FORMATS.includes('pdf'));
});

test('client routes by intent confidence and the server tells the model about routing and file format', () => {
  const ui = fs.readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
  assert.match(ui, /classifyRequest\(currentText,\{attachments:attach\}\)/);
  // No Video agent (or an ambiguous request) never blocks: the prompt falls through to Chat.
  assert.match(ui, /if\(!configured\.length&&\(fn==='Video'\|\|intent\.confidence!=='high'\)\)return false/);
  assert.match(ui, /outputFormat:intent\.fileFormat/);
  assert.match(server, /outputFormat:z\.string\(\)\.regex\(\/\^\[a-z0-9\]\{1,10\}\$\/\)/);
  assert.match(server, /outputFormatInstruction\(i\.outputFormat\)/);
  for (const format of TEXT_OUTPUT_FORMATS) assert.match(format, /^[a-z0-9]{1,10}$/, `server output schema would reject ${format}`);
  assert.match(server, /Never say you cannot generate images, video or files/);
});

test('a missing Video agent never shows a configure-video message in the chat area', () => {
  const files = ['../src/ui/App.jsx', '../src/ui/WorkspaceSection.jsx', '../server/app.js']
    .map(f => fs.readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  for (const phrase of [/Add a video agent/i, /Configure a Video agent/i, /add the original video agent/i, /add an Image or Video agent/i]) {
    assert.doesNotMatch(files, phrase);
  }
  assert.doesNotMatch(files, /setMissingAgentFunction\('Video'\)/);
});

test('any provider or model can be used: custom endpoints are enabled and model IDs are free text', async () => {
  const { providersForFunction, providerById } = await import('../src/lib/provider-registry.js');
  for (const id of ['openai-compatible', 'anthropic-compatible', 'azure-openai']) {
    assert.notEqual(providerById(id)?.implemented, false, `${id} must not be disabled`);
    assert.ok(providersForFunction('Chat').some(p => p.id === id), `${id} must be selectable for Chat`);
  }
  const agentsUi = fs.readFileSync(new URL('../src/ui/AgentsWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(agentsUi, /Model ID<input required/);
  assert.doesNotMatch(agentsUi, /<option[^>]*>[^<]*Model ID/);
});
