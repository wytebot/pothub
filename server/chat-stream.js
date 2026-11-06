// Standalone (no app imports) so it can be unit-tested; mirrors the key shapes redacted elsewhere in the server.
const redactSecrets=t=>String(t||'').slice(0,25000)
  .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g,'[REDACTED]')
  .replace(/AIza[0-9A-Za-z_-]{20,}/g,'[REDACTED]')
  .replace(/\b(?:sk|rk|pk|xai|gsk|pplx|r8|key|fw|hf)[-_][A-Za-z0-9_-]{16,}/gi,'[REDACTED]')
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,'Bearer [REDACTED]');

/** Text from a string or an array of content parts ({type:'text',text}). Some providers send parts, not strings. */
export const partsText=v=>typeof v==='string'?v:Array.isArray(v)?v.map(x=>typeof x==='string'?x:String(x?.text||'')).join(''):'';

const clean=v=>redactSecrets(String(v||'')).replace(/\s+/g,' ').trim().slice(0,200);

/** Readable reason from a failed provider response (JSON {error:{message}}, {message}, or plain text). */
export async function providerErrorDetail(response){
  try{
    const text=await response.text();let message=text;
    try{const j=JSON.parse(text);message=j?.error?.message||j?.message||(typeof j?.error==='string'?j.error:'')||j?.detail||text}catch{}
    return clean(message);
  }catch{return ''}
}

/**
 * Read an OpenAI-style (choices[].delta.content) or Anthropic-style (delta.text) event stream.
 * Also accepts endpoints that ignore stream:true and answer with one JSON document, and surfaces
 * in-stream error events instead of reporting "no text".
 */
export async function readChatStream(response,kind,onToken,meta={}){
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',full='',raw='';
  const fail=e=>{throw new Error(`AI endpoint error: ${clean(e?.message||e?.type||e)}`)};
  const feed=obj=>{
    if(obj?.error)fail(obj.error);
    if(obj?.type==='error')fail(obj.error||obj.message||'stream error');
    const fr=kind==='anthropic'?(obj?.type==='message_delta'?obj?.delta?.stop_reason:''):obj?.choices?.[0]?.finish_reason;
    if(fr==='length'||fr==='max_tokens')meta.finish='length';
    const text=kind==='anthropic'?obj?.delta?.text:partsText(obj?.choices?.[0]?.delta?.content);
    if(typeof text==='string'&&text){full+=text;onToken(text)}
  };
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    const chunk=decoder.decode(value,{stream:true});
    if(raw.length<2_000_000)raw+=chunk;
    buffer+=chunk;
    let cut;
    while((cut=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,cut).trim();buffer=buffer.slice(cut+1);
      if(!line.startsWith('data:'))continue;
      const data=line.slice(5).trim();
      if(!data||data==='[DONE]')continue;
      let obj;try{obj=JSON.parse(data)}catch{continue}
      feed(obj);
    }
  }
  if(!full){
    let doc=null;try{doc=JSON.parse(raw.trim())}catch{}
    if(doc){
      if(doc.error)fail(doc.error);
      if(doc.choices?.[0]?.finish_reason==='length'||doc.stop_reason==='max_tokens')meta.finish='length';
      const text=kind==='anthropic'?partsText(doc.content):(partsText(doc.choices?.[0]?.message?.content)||String(doc.output_text||''));
      if(text){full=text;onToken(text)}
    }
  }
  if(!full)throw new Error('The configured model returned no text.');
  return full;
}
