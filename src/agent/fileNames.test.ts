import { describe, expect, it } from 'vitest';
import { bundleName, cleanName, describeWork, documentName, fileName, groupName, headingOf, nameFromText, projectFromArchive, slugName, snippetName, subjectFromPrompt } from './fileNames';

const z = (...names: string[]) => names.map((name) => ({ name }));

describe('zip names say what is inside', () => {
  it('names a fixed app after the app and the fix', () => {
    expect(bundleName({ prompt: 'fix the auth ui in pothub and zip it', inputs: z('pothub-main-fixed__2_.zip') })).toBe('pothub auth-ui fixed');
    expect(bundleName({ prompt: 'Please fix this project and give me the zip', inputs: z('pothub-0_5_10-account-sites-limits.zip') })).toBe('pothub fixed version');
    expect(bundleName({ prompt: 'fix the bugs in the login page and zip it', inputs: z('shop.zip') })).toBe('shop login-page fixed');
  });
  it('names source code after the app', () => {
    expect(bundleName({ prompt: 'give me the source code of WyBuild as a zip' })).toBe('WyBuild source code');
    expect(bundleName({ prompt: 'make an app called Zento and zip it' })).toBe('Zento source code');
    expect(bundleName({ prompt: 'build me a simple todo app with ReactJS and zip it' })).toBe('todo app source code');
  });
  it('names updates and additions', () => {
    expect(bundleName({ prompt: 'add dark mode to the app and send a zip', inputs: z('pothub.zip') })).toBe('pothub dark-mode added');
    expect(bundleName({ prompt: 'improve it', inputs: z('WyBuild.zip') })).toBe('WyBuild updated version');
  });
  it('never falls back to the first words of the request or a date', () => {
    expect(bundleName({ prompt: 'zip this' })).toBe('MonyGist files');
    expect(bundleName({ prompt: 'zip these', inputs: z('a.png', 'b.png'), reply: '# Inventory Tracker\nbody' })).toBe('Inventory Tracker files');
    for (const n of [bundleName({ prompt: 'please could you put everything together nicely and send it to me as a zip file' })]) expect(n).not.toMatch(/\d{4}-\d{2}-\d{2}|please could/i);
  });
});

describe('project names from archives', () => {
  it('keeps the name before versions and filler words', () => {
    expect(projectFromArchive('pothub-main-fixed__2_.zip')).toBe('pothub');
    expect(projectFromArchive('pothub-0_5_10-account-sites-limits.zip')).toBe('pothub');
    expect(projectFromArchive('WyBuild.zip')).toBe('WyBuild');
    expect(projectFromArchive('my-app_v2_final (1).zip')).toBe('my-app');
    expect(projectFromArchive('main.zip')).toBeNull();
  });
});

describe('documents', () => {
  it('uses the real heading, skips generic ones, then falls back to what was asked for', () => {
    expect(fileName({ prompt: 'write a pdf', reply: '# Q3 Sales Report\n\nbody' })).toBe('Q3 Sales Report');
    expect(headingOf('# Completion report\n\n## Cover letter for Acme\n')).toBe('Cover letter for Acme');
    expect(documentName({ prompt: 'Please write me a cover letter for the software engineer job at Acme as a PDF', reply: '## Summary\ntext' })).toBe('Cover letter for the software engineer job at Acme');
    expect(subjectFromPrompt('can you create a weekly meal plan in docx?')).toBe('Weekly meal plan');
    expect(subjectFromPrompt('make it a pdf')).not.toBe('');
  });
  it('keeps the name of the one file that is being changed', () => {
    expect(fileName({ prompt: 'fix this file', inputs: z('App.tsx'), reply: 'x' })).toBe('App fixed version');
  });
  it('names an old reply by its first real line', () => {
    expect(nameFromText('# Study plan\n\nbody')).toBe('Study plan');
    expect(nameFromText('Sure! Here is a plan.\nmore')).toBe('MonyGist answer');
    expect(nameFromText('Photosynthesis turns light into sugar. More text.')).toBe('Photosynthesis turns light into sugar');
  });
});

describe('describing the work', () => {
  it('finds fix, update and add, and the part of the app they are about', () => {
    expect(describeWork('fix the auth ui in pothub', 'pothub')).toBe('auth-ui fixed');
    expect(describeWork('fix pothub', 'pothub')).toBe('fixed version');
    expect(describeWork('upgrade the checkout flow')).toBe('checkout-flow updated');
    expect(describeWork('tell me a joke')).toBeNull();
  });
});

describe('several files together', () => {
  it('uses what they share, or the first and how many more', () => {
    expect(groupName(['Invoice-Jan.pdf', 'Invoice-Feb.pdf', 'Invoice-Mar.pdf'], 'merged')).toBe('Invoice merged');
    expect(groupName(['IMG_2031.jpg', 'passport.png', 'x.png'], 'photos')).toBe('IMG_2031 and 2 more photos');
    expect(groupName(['Contract.pdf', 'Appendix.pdf'], 'merged')).toBe('Contract and Appendix merged');
    expect(groupName(['notes.txt'], 'files')).toBe('notes');
  });
});

describe('saved code', () => {
  it('is named for what it declares', () => {
    expect(snippetName('tsx', 'export default function Home() {}', 'tsx')).toBe('Home.tsx');
    expect(snippetName('python', 'def parse_logs(p):\n  pass', 'py')).toBe('parse_logs.py');
    expect(snippetName('js', '// file: src/util/date.js\nexport const a = 1', 'js')).toBe('date.js');
    expect(snippetName('html', '<html><title>Pricing page</title></html>', 'html')).toBe('Pricing page.html');
    expect(snippetName('', 'echo hi', 'txt')).toBe('code snippet.txt');
  });
});

describe('safe names', () => {
  it('removes characters no system allows and avoids reserved names', () => {
    expect(cleanName('a/b:c*?"<>|d  e..')).toBe('a b c d e');
    expect(cleanName('CON')).toBe('CON file');
    expect(cleanName('x'.repeat(100), 20).length).toBeLessThanOrEqual(20);
    expect(cleanName('one two three four five', 12)).toBe('one two');
    expect(slugName('pothub auth-ui fixed')).toBe('pothub-auth-ui-fixed');
  });
});
