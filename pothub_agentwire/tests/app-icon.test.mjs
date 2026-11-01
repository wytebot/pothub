import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {ICON_COLORS,POT_FORMS,DEFAULT_ICON,iconId,iconAssets,normalizeIcon,isDefaultIcon,fitTransform,iconSvgString} from '../src/lib/app-icon-data.js';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');

test('pot forms and colors have unique ids and drawable artwork',()=>{
  assert.equal(new Set(POT_FORMS.map(f=>f.id)).size,POT_FORMS.length);
  assert.equal(new Set(ICON_COLORS.map(c=>c.id)).size,ICON_COLORS.length);
  assert.ok(POT_FORMS.length>=8&&ICON_COLORS.length>=9);
  for(const f of POT_FORMS){assert.ok(f.shapes.some(s=>s.r==='main'),`${f.id} needs a main shape`);for(const s of f.shapes){assert.ok(['main','cut'].includes(s.r));assert.match(s.d,/^[MmLlHhVvCcSsQqAaZz0-9.,\s-]+$/,`${f.id} has an unsupported path command`)}}
  for(const c of ICON_COLORS){for(const k of ['bg','accent','hover','lightAccent','lightHover'])assert.match(c[k],/^#[0-9a-f]{6}$/i,`${c.id}.${k}`)}
});

test('unknown or missing choices fall back to the original icon',()=>{
  assert.deepEqual(normalizeIcon(null),DEFAULT_ICON);assert.deepEqual(normalizeIcon({form:'nope',color:'nope'}),DEFAULT_ICON);
  assert.deepEqual(normalizeIcon({form:'teapot',color:'emerald'}),{form:'teapot',color:'emerald'});
  assert.ok(isDefaultIcon(DEFAULT_ICON));
});

test('the default choice keeps the shipped brand icon and manifest',()=>{
  const a=iconAssets(DEFAULT_ICON);assert.equal(a.manifest,'/manifest.webmanifest');assert.equal(a.png192,'/icons/pothub-192.png');
});

test('every pot/color combination ships PNGs and a manifest that points at them',()=>{
  let checked=0;
  for(const f of POT_FORMS)for(const c of ICON_COLORS){
    const choice={form:f.id,color:c.id},a=iconAssets(choice);assert.equal(a.id,iconId(choice));
    if(isDefaultIcon(choice))continue;
    for(const rel of [a.png192,a.png512,a.manifest])assert.ok(fs.existsSync(path.join(root,'public',rel)),`missing ${rel}`);
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'public',a.manifest),'utf8'));
    assert.deepEqual(manifest.icons.map(i=>i.src),[a.png192,a.png512]);
    assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');checked++;
  }
  assert.equal(checked,POT_FORMS.length*ICON_COLORS.length-1);
});

test('artwork is centred and scaled inside the maskable safe zone',()=>{
  for(const f of POT_FORMS){const {k}=fitTransform(f);assert.ok(k>0.8&&k<1.15,`${f.id} scale ${k}`)}
  const svg=iconSvgString({form:'cauldron',color:'violet'});assert.match(svg,/^<svg /);assert.ok(svg.includes('#6d3fd0'));
});
