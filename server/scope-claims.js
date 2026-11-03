import crypto from 'node:crypto';
const b64 = value => Buffer.from(value).toString('base64url');
const safe = value => String(value || '').trim();
export function issueScopeClaim({userId, owner, repo, branch, threadId, now=Date.now(), ttlMs=8*60*60*1000, secret=process.env.SESSION_SECRET}) {
  if (!secret || String(secret).length < 32) throw new Error('SESSION_SECRET must be at least 32 characters to sign Codelab scopes.');
  for (const [key,value] of Object.entries({userId,owner,repo,branch,threadId})) if (!safe(value) || safe(value).length > 200) throw new Error(`Invalid Codelab scope field: ${key}`);
  const payload={v:1,sub:safe(userId),owner:safe(owner),repo:safe(repo),branch:safe(branch),threadId:safe(threadId),iat:now,exp:now+Math.min(Math.max(ttlMs,60000),8*60*60*1000),nonce:crypto.randomBytes(16).toString('base64url')};
  const body=b64(JSON.stringify(payload)); const signature=crypto.createHmac('sha256',secret).update(body).digest('base64url'); return `${body}.${signature}`;
}
export function verifyScopeClaim(token,{userId,now=Date.now(),secret=process.env.SESSION_SECRET}={}) {
  if (!secret || typeof token!=='string' || token.length>3000) throw new Error('Codelab scope claim is missing or invalid.');
  const [body,signature,...extra]=token.split('.'); if(!body||!signature||extra.length)throw new Error('Codelab scope claim is malformed.');
  const expected=crypto.createHmac('sha256',secret).update(body).digest(); let actual; try{actual=Buffer.from(signature,'base64url')}catch{throw new Error('Codelab scope claim is malformed.')}; if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw new Error('Codelab scope claim signature is invalid.');
  let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))}catch{throw new Error('Codelab scope claim payload is invalid.')};
  if(p.v!==1||!p.sub||!p.owner||!p.repo||!p.branch||!p.threadId||!Number.isFinite(p.exp)||p.exp<=now)throw new Error('Codelab scope claim expired or is incomplete.');
  if(userId&&p.sub!==String(userId))throw new Error('Codelab scope claim belongs to another account.'); return p;
}
export function assertScopeTarget(scope,target){for(const key of ['owner','repo','branch'])if(String(target?.[key]||'')!==scope[key])throw new Error(`Codelab tool call attempted to leave its pinned ${key} scope.`);return true}
