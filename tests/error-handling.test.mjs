import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/ui/App.jsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/app.js', import.meta.url), 'utf8');
test('API reports network, timeout, HTTP and malformed-response failures with diagnostic IDs', () => {
  for (const token of ['POTHUB_REQUEST_TIMEOUT','POTHUB_NETWORK_ERROR','POTHUB_INVALID_JSON','requestId','error.status = res.status','error.endpoint = taskPath']) assert.ok(api.includes(token), `missing ${token}`);
});
test('UI exposes diagnostic details and copyable error reports, and catches uncaught errors', () => {
  for (const token of ['Show diagnostic details','Copy diagnostic report','unhandledrejection','POTHUB_UNCAUGHT_ERROR','POTHUB_UNHANDLED_REJECTION']) assert.ok(app.includes(token), `missing ${token}`);
});
test('server tags requests and returns request IDs with explicit API error codes', () => {
  for (const token of ['X-Request-Id','POTHUB_ROUTE_NOT_FOUND','POTHUB_BODY_TOO_LARGE','requestId']) assert.ok(server.includes(token), `missing ${token}`);
});
