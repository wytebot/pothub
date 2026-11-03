import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/ui/App.jsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/ui/WorkspaceSection.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/ui/styles.css',import.meta.url),'utf8');
test('creator chat exposes request lifecycle steps without cycling through fake progress',()=>{
 assert.match(app,/function ProgressSteps\(\{labels=\[\],activeIndex=0,detail=''\}\)/);
 assert.doesNotMatch(app,/setInterval\(\(\)=>setActive/);
 assert.match(app,/\[chatStage,setChatStage\]=useState\(0\)/);
 assert.match(ui,/Preparing chat context and attachments/);
 assert.match(ui,/Saving the response to chat history/);
 assert.match(ui,/activeIndex=\{chatStage\}/);
});
test('chat composer grows to a bounded height then scrolls internally',()=>{
 assert.match(ui,/Math\.min\(el\.scrollHeight,240\)/);
 assert.match(css,/\.chat-main \.composer textarea\{[^}]*max-height:min\(40dvh,240px\)/s);
 assert.match(css,/\.chat-main \.composer textarea\{[^}]*overflow-y:hidden/s);
 assert.match(css,/\.edit-workspace \.edit-composer textarea\{[^}]*max-height:min\(40dvh,240px\)!important/s);
 assert.match(css,/\.edit-workspace \.edit-composer textarea\{[^}]*overflow-y:hidden/s);
});
test('creator attachments accept common code and document formats and retain size/count limits',()=>{
 assert.match(ui,/\.csv,\.json,\.js,\.jsx,\.ts,\.tsx,\.html,\.css,\.xml/);
 assert.match(ui,/\.slice\(0,8\)/);
 assert.match(ui,/15\*1024\*1024/);
 assert.match(app,/textContent=\(await f\.text\(\)\)\.slice\(0,80000\)/);
});

test('repository chat accepts and forwards file and image attachments',()=>{
 const server=readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
 assert.match(ui,/setEditAttachments\(\[\]\)/);
 assert.match(ui,/attachments:attachmentPayload/);
 assert.match(ui,/edit-composer-attachments/);
 assert.match(server,/attachments:z\.array\(z\.object\(\{id:z\.string\(\)\.max\(100\)\.optional\(\)/);
 assert.match(server,/Attached file contents/);
 assert.match(server,/const extraParts=\(i\.attachments\|\|\[\]\)/);
});
