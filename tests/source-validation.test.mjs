import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceSyntax,assertValidSourceSyntax} from '../server/source-validation.js';

test('patch validator parses JS, JSX, TS and TSX using the real TypeScript parser',()=>{
  for(const [name,source] of [['a.js','const n = 1;'],['a.jsx','export default () => <div />;'],['a.ts','const n: number = 1;'],['a.tsx','export const A = () => <div />;']])assert.equal(validateSourceSyntax(name,source).valid,true,name);
});
test('patch validator rejects malformed JSX and TypeScript',()=>{
  assert.equal(validateSourceSyntax('bad.jsx','export default () => <div> ;').valid,false);
  assert.equal(validateSourceSyntax('bad.ts','const x: = 3').valid,false);
  assert.throws(()=>assertValidSourceSyntax('bad.tsx','const App = () => <div>'),/does not parse/);
});
