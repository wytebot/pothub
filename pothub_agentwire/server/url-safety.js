import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import { Readable } from 'node:stream';

function ipv4Number(value){const p=value.split('.').map(Number);if(p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255))return null;return p;}
export function isPublicAddress(address){
  const type=isIP(address);
  if(type===4){const p=ipv4Number(address);if(!p)return false;const [a,b,c]=p;
    return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19))||(a===192&&b===0)||(a===192&&b===2)||(a===192&&b===88&&c===99)||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));}
  if(type!==6)return false;
  const v=address.toLowerCase().split('%')[0];
  if(v==='::'||v==='::1'||v.startsWith('fc')||v.startsWith('fd')||/^fe[89ab]/.test(v)||v.startsWith('ff')||v.startsWith('2001:db8:'))return false;
  // IPv4-mapped IPv6, including fully hexadecimal forms such as ::ffff:7f00:1.
  // Expand IPv6 compression so mapped IPv4 is rejected even when written as
  // 0:0:0:0:0:ffff:7f00:1 rather than ::ffff:127.0.0.1.
  let normalized=v;if(v.includes('.')){const idx=v.lastIndexOf(':');const oct=ipv4Number(v.slice(idx+1));if(!oct)return false;const hi=((oct[0]<<8)|oct[1]).toString(16),lo=((oct[2]<<8)|oct[3]).toString(16);normalized=v.slice(0,idx+1)+hi+':'+lo;}
  const halves=normalized.split('::');if(halves.length>2)return false;const left=halves[0]?halves[0].split(':'):[],right=halves.length===2&&halves[1]?halves[1].split(':'):[];const missing=8-left.length-right.length;const groups=halves.length===1?left:Array(missing).fill('0').concat([]);const full=halves.length===1?left:[...left,...Array(Math.max(0,missing)).fill('0'),...right];if(full.length!==8||full.some(x=>!/^[0-9a-f]{1,4}$/.test(x)))return false;const nums=full.map(x=>parseInt(x,16));if(nums.slice(0,5).every(x=>x===0)&&nums[5]===0xffff){const octets=[nums[6]>>8,nums[6]&255,nums[7]>>8,nums[7]&255];return isPublicAddress(octets.join('.'));}
  // Reject NAT64 and 6to4 transition ranges; their embedded IPv4 can be private.
  if(nums[0]===0x64&&nums[1]===0xff9b)return false;if(nums[0]===0x2002)return false;if(nums[0]===0x2001&&(nums[1]===0||nums[1]===2||(nums[1]&0xfff0)===0x10||nums[1]===0x0db8))return false;
  return (nums[0]&0xe000)===0x2000;
}
export async function resolvePublicHost(host,{lookup=dns.lookup}={}){
  const bare=String(host||'').toLowerCase().replace(/^\[|\]$/g,'');
  if(isIP(bare))throw new Error('Literal IP destinations are not allowed.');
  let rows;try{rows=await lookup(bare,{all:true,verbatim:true});}catch{throw new Error('Destination hostname could not be resolved safely.');}
  if(!Array.isArray(rows)||!rows.length||rows.some(x=>!isPublicAddress(x.address)))throw new Error('Destination resolves to a private or reserved network address.');
  return rows;
}
export async function assertSafeHttpsUrl(value,{lookup=dns.lookup,allowHosts=null}={}){
  let url;try{url=new URL(value)}catch{throw new Error('URL is invalid.');}
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||host==='localhost'||!host.includes('.')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.localhost')||host.endsWith('.test')||host==='metadata.google.internal')throw new Error('Only public HTTPS destinations are allowed.');
  if(allowHosts&&!allowHosts.some(x=>host===x||host.endsWith(`.${x}`)))throw new Error('Destination host is not on the provider CDN allowlist.');
  await resolvePublicHost(host,{lookup});return url.toString();
}
/** HTTPS request whose socket is pinned to an address from the same DNS answer
 * that was checked for public routability. Redirects are deliberately manual;
 * callers must pass each Location back through this function. */
export async function fetchPinnedHttps(value,options={}){
  const url=new URL(await assertSafeHttpsUrl(value,{allowHosts:options.allowHosts}));
  const rows=await resolvePublicHost(url.hostname);
  const chosen=rows[0];
  return new Promise((resolve,reject)=>{
    const req=https.request(url,{method:options.method||'GET',headers:options.headers||{},servername:url.hostname,lookup(_host,lookupOptions,callback){if(lookupOptions?.all)callback(null,rows);else callback(null,chosen.address,chosen.family||isIP(chosen.address));}},response=>{
      const headers=new Headers();for(const [k,v] of Object.entries(response.headers)){if(Array.isArray(v))for(const x of v)headers.append(k,x);else if(v!==undefined)headers.set(k,String(v));}
      const body=[204,304].includes(response.statusCode||0)?null:Readable.toWeb(response);
      resolve(new Response(body,{status:response.statusCode||502,statusText:response.statusMessage||'',headers}));
    });
    const signal=options.signal;if(signal){if(signal.aborted){req.destroy(signal.reason||new Error('Request aborted'));return;}signal.addEventListener('abort',()=>req.destroy(signal.reason||new Error('Request aborted')),{once:true});}
    req.on('error',reject);if(options.body!==undefined&&options.body!==null){if(typeof options.body==='string'||Buffer.isBuffer(options.body)||options.body instanceof Uint8Array)req.write(options.body);else{req.destroy(new Error('Pinned HTTPS only supports string or byte request bodies.'));return;}}req.end();
  });
}
