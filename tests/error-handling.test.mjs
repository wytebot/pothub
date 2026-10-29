import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const app=readFileSync(new URL('../src/ui/App.jsx',import.meta.url),'utf8');const server=readFileSync(new URL('../server/app.js',import.meta.url),'utf8');
test('client has timeout and user-readable errors',()=>{assert.match(app,/AbortController/);assert.match(app,/Request timed out/);assert.match(app,/role="alert"/)});
test('workspace panel has an error boundary and fallback',()=>{assert.match(app,/class ReactBoundary extends React\.Component/);assert.match(app,/This panel encountered an error/)});
test('server tags requests and returns diagnostic IDs',()=>{for(const token of ['X-Request-Id','POTHUB_ROUTE_NOT_FOUND','POTHUB_BODY_TOO_LARGE','requestId'])assert.ok(server.includes(token),`missing ${token}`)});
test('video routes validate requests and cap result size',()=>{for(const route of ['/api/video/submit','/api/video/status','/api/video/result','/api/video/cancel'])assert.ok(server.includes(route));assert.match(server,/150\*1024\*1024/)});
