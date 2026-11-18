import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { wantedOutput } from './deliver';
import { buildBundle, parseBundle } from './bundle';
import { csvToXlsx, firstTable, markdownToPptx, parseCsv, slidesFrom, zipEntries } from './office';
import { detectLocal, runLocal } from './local';
import type { Attachment, AttachKind } from './attachments';
import { interpret } from '../models/router';
import { parseSrt } from '../editor/model';

const file = (name: string, mime: string, kind: AttachKind, data: string): Attachment => { const blob = new Blob([data], { type: mime }); return { id: name, name, mime, size: blob.size, kind, blob }; };
const names = async (b: Blob) => Object.keys(unzipSync(new Uint8Array(await b.arrayBuffer())));
const history = [{ role: 'user', text: 'plan' }, { role: 'assistant', text: '# Study plan\n\n| Day | Topic |\n|---|---|\n| Mon | Maths |\n\nGood luck with your revision this week, you can do it.' }];

describe('what output format a request asks for', () => {
  it('reads the format only when it is the output', () => {
    expect(wantedOutput('summarise this pdf').format).toBe('chat');
    expect(wantedOutput('fix the bug in app.py').format).toBe('chat');
    expect(wantedOutput('what is my zip code').format).toBe('chat');
    expect(wantedOutput('I need a word list for kids').format).toBe('chat');
    expect(wantedOutput('write a report as a pdf').format).toBe('pdf');
    expect(wantedOutput('make a budget spreadsheet').format).toBe('xlsx');
    expect(wantedOutput('make slides about solar energy').format).toBe('pptx');
    expect(wantedOutput('build a todo app and give me the whole project as a zip').format).toBe('zip');
    expect(wantedOutput('write a script and save it as rename.py')).toMatchObject({ format: 'file', ext: 'py' });
  });
  it('treats building an app or a file as a text job, never a picture', () => {
    expect(interpret('make a todo app as a zip').task).toBe('text');
    expect(interpret('make a poster for my app').task).toBe('image');
  });
});

describe('office files built on the device', () => {
  it('writes a real xlsx with numbers, formulas and sheets', async () => {
    const x = unzipSync(new Uint8Array(await csvToXlsx('--- sheet: Budget ---\nItem,Qty\nA,2\nTotal,=SUM(B2:B2)\n--- sheet: Notes ---\nx\ny').arrayBuffer()));
    expect(Object.keys(x)).toContain('xl/worksheets/sheet2.xml');
    const s1 = strFromU8(x['xl/worksheets/sheet1.xml']);
    expect(s1).toContain('<v>2</v>'); expect(s1).toContain('<f>SUM(B2:B2)</f>');
  });
  it('turns an outline into slides and a pptx', async () => {
    const s = slidesFrom('# Deck\nsub\n\n## One\n- a\n- b\n\n## Two\n' + Array.from({ length: 10 }, (_, i) => `- p${i}`).join('\n'));
    expect(s[0].lead).toBe(true); expect(s.length).toBe(4);
    expect(await names(markdownToPptx('# T\n## A\n- x'))).toContain('ppt/slides/slide2.xml');
  });
  it('reads csv and finds a table inside an answer', () => {
    expect(parseCsv('a;b\n"x;y";2')).toEqual([['a', 'b'], ['x;y', '2']]);
    expect(firstTable('# Hi\n\n| A | B |\n|---|---|\n| 1 | 2 |')).toEqual([['A', 'B'], ['1', '2']]);
  });
  it('zips safely and never loses a duplicate', async () => {
    const z = await names(zipEntries([{ path: '/../a.txt', data: new Uint8Array([1]) }, { path: 'a.txt', data: new Uint8Array([2]) }]));
    expect(z).toEqual(['a.txt', 'a (2).txt']);
  });
});

describe('multi-file answers', () => {
  const reply = '=== FILE: package.json ===\n{"name":"x"}\n=== END FILE ===\n=== FILE: docs/guide.docx ===\n# Guide\n=== END FILE ===\n=== FILE: ../../evil.txt ===\nno\n=== END FILE ===';
  it('parses marked files and keeps paths inside the archive', () => {
    expect(parseBundle(reply).map((f) => f.path)).toEqual(['package.json', 'docs/guide.docx', 'evil.txt']);
  });
  it('accepts a file name followed by a code block', () => {
    expect(parseBundle('**src/index.js**\n```js\n1\n```').map((f) => f.path)).toEqual(['src/index.js']);
  });
  it('builds one zip with real documents inside', async () => {
    const b = await buildBundle(reply, 'My app'); expect(b).not.toBeNull();
    expect(await names(b!.blob)).toEqual(['my-app/package.json', 'my-app/docs/guide.docx', 'my-app/evil.txt']);
  });
});

describe('work that needs no model', () => {
  const txt = file('notes.txt', 'text/plain', 'text', 'Hello'); const csv = file('s.csv', 'text/csv', 'text', 'a,b\n1,2');
  it('recognises plain file jobs and leaves thinking to the model', () => {
    expect(detectLocal('zip these files', [txt, csv])?.kind).toBe('zip');
    expect(detectLocal('convert to pdf', [txt])).toMatchObject({ kind: 'convert', format: 'pdf' });
    expect(detectLocal('make it a pdf', [], history)).toMatchObject({ kind: 'convert', source: 'last' });
    expect(detectLocal('summarize this and give me a pdf', [txt])).toBeNull();
    expect(detectLocal('make that into a pdf and shorten it', [], history)).toBeNull();
    expect(detectLocal('make it a pdf', [], [])).toBeNull();
  });
  it('builds the files', async () => {
    const z = await runLocal(detectLocal('zip these files', [txt, csv])!, [txt, csv]); expect(await names(z.file.blob)).toEqual(['notes.txt', 's.csv']);
    const x = await runLocal(detectLocal('save it as excel', [], history)!, []); expect(x.file.name).toBe('study-plan.xlsx');
    const p = await runLocal(detectLocal('convert to pdf', [txt])!, [txt]); expect(p.file.name).toBe('notes.pdf'); expect(p.text).toContain('no AI model');
  });
});

describe('subtitles', () => {
  it('reads srt and vtt', () => {
    expect(parseSrt('1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03.000 --> 00:00:04.000\n<i>Bye</i>')).toEqual([{ start: 1, end: 2.5, text: 'Hello' }, { start: 3, end: 4, text: 'Bye' }]);
  });
});
