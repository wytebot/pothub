/** Remove terminal decoration, progress noise and repeated lines while retaining the first failure. */
export function preprocessLogs(value, limit = 42000) {
  const raw=String(value??'').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g,'').replace(/\r/g,'');
  const lines=raw.split('\n'); const seen=new Set(), clean=[];
  const isNoise=line=>/^\s*(?:Downloading|Progress:|npm notice|warning:.*deprecated|\[debug\]|::debug::)/i.test(line);
  for(const line of lines){const s=line.trimEnd();if(!s||isNoise(s)||seen.has(s))continue;seen.add(s);clean.push(s)}
  if(clean.join('\n').length<=limit)return clean.join('\n');
  const errorIndex=clean.findIndex(x=>/\b(error|failed|failure|exception|fatal|cannot|not found|denied|timeout|timed out)\b/i.test(x));
  const keep=Math.max(10,Math.floor(limit/120));const start=Math.max(0,(errorIndex<0?0:errorIndex)-Math.floor(keep*.45));
  const head=clean.slice(0,Math.min(8,start));const tail=clean.slice(start,start+keep);
  return [...head,'… [middle log lines omitted to preserve the first failure and context] …',...tail].join('\n').slice(-limit);
}
export function boundPrompt(value, configuredLimit = 60000) {
  const limit = Math.max(12000, Math.min(90000, Number(configuredLimit) || 60000));
  const text=String(value??'');if(text.length<=limit)return text;
  const marker='\n\n[... middle context omitted ...]\n\n';const keep=limit-marker.length;
  return text.slice(0,Math.ceil(keep*.62))+marker+text.slice(-Math.floor(keep*.38));
}
/** Tolerant JSON object parser: fenced JSON, surrounding prose, and truncated closing braces. */
export function parseModelJson(value) {
  const text=String(value??'').replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const start=text.search(/[\[{]/);if(start<0)throw new Error('AI returned an unreadable report. Try again with shorter logs.');
  const candidate=text.slice(start);let lastError;
  try { const end=Math.max(candidate.lastIndexOf('}'),candidate.lastIndexOf(']')); if(end>=0)return JSON.parse(candidate.slice(0,end+1)); } catch(e){lastError=e}
  let stack=[],inString=false,escape=false;
  for(const ch of candidate){if(inString){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')inString=false;continue;}if(ch==='"'){inString=true;continue;}if(ch==='{'||ch==='[')stack.push(ch);else if(ch==='}'||ch===']'){const expected=ch==='}'?'{':'[';if(stack.at(-1)===expected)stack.pop();else throw new Error('AI returned malformed JSON. Retry the operation.');}}
  if(inString)throw new Error('AI returned malformed JSON. Retry the operation.');
  if(stack.length){const suffix=stack.reverse().map(x=>x==='{'?'}':']').join('');try{return JSON.parse(candidate.replace(/,\s*$/,'')+suffix)}catch(e){lastError=e}}
  throw new Error(lastError?'AI returned invalid JSON. Retry the operation.':'AI returned an unreadable report. Try again with shorter logs.');
}
export function redactProviderError(message, secrets=[]) {let out=String(message||'Provider request failed');for(const key of secrets.filter(Boolean))out=out.split(key).join('[REDACTED]');return out.replace(/\b(sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{12,}|Bearer\s+\S+)/gi,'[REDACTED]').slice(0,240)}
