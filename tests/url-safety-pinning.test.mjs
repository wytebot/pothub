import test from 'node:test';
import assert from 'node:assert/strict';
import {isPublicAddress,resolvePublicHost,assertSafeHttpsUrl} from '../server/url-safety.js';

test('private, reserved and IPv4-mapped IPv6 destinations are rejected in dotted and hexadecimal forms',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.1.1','192.168.1.2','::1','::ffff:127.0.0.1','::ffff:7f00:1','0:0:0:0:0:ffff:7f00:1','::ffff:192.168.1.1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('::ffff:8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});
test('DNS resolution rejects a mixed public/private answer and only permits allowlisted CDN hosts',async()=>{
  await assert.rejects(resolvePublicHost('cdn.example.com',{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]}),/private or reserved/);
  await assert.rejects(assertSafeHttpsUrl('https://cdn.example.com/video.mp4',{lookup:async()=>[{address:'8.8.8.8',family:4}],allowHosts:['replicate.delivery']}),/allowlist/);
});
