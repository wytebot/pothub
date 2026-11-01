import { Buffer } from 'node:buffer';
import {fetchPinnedHttps} from './url-safety.js';

const IMAGE_MIME = /^image\/(png|jpeg|webp)$/i;
const timeout = (ms=45000,deadlineAt=0) => AbortSignal.timeout(Math.max(1,Math.min(ms,deadlineAt?deadlineAt-Date.now():ms)));
const deadline = (ms,input) => Math.min(Date.now()+ms,input?.deadlineAt||Number.POSITIVE_INFINITY);
const json = async (response, key) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = data?.error?.message || data?.error || data?.message || `Image provider returned HTTP ${response.status}`;
    message = String(message).replaceAll(key, '[redacted]').slice(0, 300);
    throw new Error(message);
  }
  return data;
};
export async function readImageBytes(response){
  const declared=Number(response.headers.get('content-length')||0);if(declared>15*1024*1024)throw new Error('Generated image exceeds the 15 MB delivery limit.');
  if(!response.body){const b=Buffer.from(await response.arrayBuffer());if(b.length>15*1024*1024)throw new Error('Generated image exceeds the 15 MB delivery limit.');return b}
  const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>15*1024*1024){await reader.cancel();throw new Error('Generated image exceeds the 15 MB delivery limit.')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock?.()}return Buffer.concat(chunks,total);
}
export function normalizeImage(data, mime='image/png', index=1) {
  if (!data) throw new Error('Generated image is empty or exceeds the 15 MB delivery limit.');
  if (!IMAGE_MIME.test(mime)) throw new Error('Provider returned an unsupported image format.');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('Generated image is empty or exceeds the 15 MB delivery limit.');
  const ext = mime.split('/')[1].replace('jpeg','jpg');
  return { filename:`pothub-image-${index}.${ext}`, mimeType:mime, contentBase64:bytes.toString('base64'), contentSize:bytes.length, binary:true, format:ext };
}
async function openAI(c, input) {
  const base = (c.baseUrl || 'https://api.openai.com/v1').replace(/\/$/,'');
  const response = await fetchPinnedHttps(`${base}/images/generations`, { method:'POST', signal:timeout(90000,input.deadlineAt), headers:{Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'}, body:JSON.stringify({model:c.model,prompt:input.prompt,n:input.count,size:input.size||(input.aspectRatio==='9:16'||input.aspectRatio==='2:3'||input.aspectRatio==='3:4'?'1024x1536':input.aspectRatio==='16:9'||input.aspectRatio==='3:2'||input.aspectRatio==='4:3'?'1536x1024':'1024x1024'),response_format:'b64_json'}) });
  const d = await json(response,c.key);
  return (d.data||[]).filter(x=>x.b64_json).map((x,i)=>normalizeImage(x.b64_json,'image/png',i+1));
}
async function stability(c,input) {
  const base='https://api.stability.ai';if(c.baseUrl&&new URL(c.baseUrl).origin!==base)throw new Error('Custom Stability endpoints are not supported. Use the official Stability endpoint.');
  const form=new FormData(); form.set('prompt',input.prompt); form.set('output_format','png'); form.set('aspect_ratio',input.aspectRatio||'1:1');
  const response=await fetch(`${base}/v2beta/stable-image/generate/${encodeURIComponent(c.model||'stable-image-core')}`,{method:'POST',signal:timeout(90000,input.deadlineAt),headers:{Authorization:`Bearer ${c.key}`,Accept:'image/*'},body:form});
  if(!response.ok) await json(response,c.key);
  const mime=(response.headers.get('content-type')||'image/png').split(';')[0];
  if(!IMAGE_MIME.test(mime)) throw new Error('Stability returned a non-image response.');
  const bytes=await readImageBytes(response);
  return [normalizeImage(bytes.toString('base64'),mime,1)];
}
async function bfl(c,input) {
  const base=(c.baseUrl||'https://api.bfl.ai').replace(/\/$/,'');
  const response=await fetchPinnedHttps(`${base}/v1/${encodeURIComponent(c.model||'flux-pro-1.1')}`,{method:'POST',signal:timeout(20000,input.deadlineAt),headers:{'x-key':c.key,'Content-Type':'application/json'},body:JSON.stringify({prompt:input.prompt,aspect_ratio:input.aspectRatio||'1:1',output_format:'png'})});
  const d=await json(response,c.key); const polling=String(d.polling_url||'');
  if(!polling.startsWith(`${base}/`)) throw new Error('Black Forest Labs did not return an approved polling URL.');
  const deadlineAt=deadline(22000,input);
  while(Date.now()<deadlineAt){ await new Promise(r=>setTimeout(r,1800)); const p=await fetchPinnedHttps(polling,{headers:{'x-key':c.key},signal:timeout(12000,input.deadlineAt),allowHosts:[new URL(base).hostname]}); const result=await json(p,c.key); if(result.status==='Ready'&&result.result?.sample){const imageUrl=String(result.result.sample);if(!imageUrl.startsWith('https://')||!(new URL(imageUrl).hostname==='bfl.ai'||new URL(imageUrl).hostname.endsWith('.bfl.ai')))throw new Error('Image result URL is not an approved Black Forest Labs host.');const img=await fetchPinnedHttps(imageUrl,{signal:timeout(30000,input.deadlineAt),allowHosts:['bfl.ai']});if(!img.ok)throw new Error('Could not download generated image.');const mime=(img.headers.get('content-type')||'image/png').split(';')[0];if(!IMAGE_MIME.test(mime))throw new Error('Provider returned an unsupported image format.');return [normalizeImage((await readImageBytes(img)).toString('base64'),mime,1)]} if(['Error','Failed'].includes(result.status))throw new Error('Black Forest Labs image generation failed.'); }
  throw new Error('Image generation is still processing. Please retry status check later.');
}
async function replicate(c,input) {
  const base=(c.baseUrl||'https://api.replicate.com/v1').replace(/\/$/,'');
  const [model,version]=String(c.model||'').split(':');
  const modelPath=model.split('/').map(encodeURIComponent).join('/');
  const endpoint=version?`${base}/predictions`:`${base}/models/${modelPath}/predictions`;
  const payload=version?{version,input:{prompt:input.prompt,aspect_ratio:input.aspectRatio||'1:1'}}:{input:{prompt:input.prompt,aspect_ratio:input.aspectRatio||'1:1'}};
  const response=await fetchPinnedHttps(endpoint,{method:'POST',signal:timeout(20000,input.deadlineAt),headers:{Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)}); const d=await json(response,c.key);
  const getUrl=String(d.urls?.get||''); if(!getUrl.startsWith('https://api.replicate.com/v1/')) throw new Error('Replicate returned an invalid prediction URL.');
  const deadlineAt=deadline(22000,input); let prediction=d;
  while(Date.now()<deadlineAt && !['succeeded','failed','canceled'].includes(prediction.status)){await new Promise(r=>setTimeout(r,1800));const r=await fetchPinnedHttps(getUrl,{headers:{Authorization:`Bearer ${c.key}`},signal:timeout(12000,input.deadlineAt),allowHosts:['api.replicate.com']});prediction=await json(r,c.key)}
  if(prediction.status!=='succeeded')throw new Error(prediction.status==='failed'?'Replicate image generation failed.':'Replicate image generation is still processing. Retry later.');
  const urls=(Array.isArray(prediction.output)?prediction.output:[prediction.output]).filter(x=>typeof x==='string').slice(0,input.count);const out=[];
  for(const [i,url] of urls.entries()){if(!url.startsWith('https://')||!['replicate.delivery','pbxt.replicate.delivery'].some(host=>new URL(url).hostname===host||new URL(url).hostname.endsWith(`.${host}`)))continue;const r=await fetchPinnedHttps(url,{signal:timeout(20000,input.deadlineAt),allowHosts:['replicate.delivery']});if(!r.ok)continue;const mime=(r.headers.get('content-type')||'image/png').split(';')[0];if(!IMAGE_MIME.test(mime))continue;out.push(normalizeImage((await readImageBytes(r)).toString('base64'),mime,i+1))}return out;
}
async function fal(c,input) {
  const model=String(c.model||'').replace(/^\/+|\/+$/g,''); if(!/^[A-Za-z0-9._/-]{2,180}$/.test(model))throw new Error('Enter a valid fal model endpoint.');
  const base=(c.baseUrl||'https://queue.fal.run').replace(/\/$/,'');
  const response=await fetchPinnedHttps(`${base}/${model}`,{method:'POST',signal:timeout(20000,input.deadlineAt),headers:{Authorization:`Key ${c.key}`,'Content-Type':'application/json'},body:JSON.stringify({prompt:input.prompt,image_size:input.aspectRatio==='9:16'?'portrait_4_3':'square_hd',num_images:input.count})});const d=await json(response,c.key);
  const statusUrl=String(d.status_url||''),responseUrl=String(d.response_url||'');if(!statusUrl.startsWith('https://queue.fal.run/')||!responseUrl.startsWith('https://queue.fal.run/'))throw new Error('fal returned an invalid queue URL.');
  const deadlineAt=deadline(22000,input);let result=null;
  while(Date.now()<deadlineAt){await new Promise(r=>setTimeout(r,1800));const r=await fetchPinnedHttps(statusUrl,{headers:{Authorization:`Key ${c.key}`},signal:timeout(12000,input.deadlineAt),allowHosts:['queue.fal.run']});const s=await json(r,c.key);if(s.status==='COMPLETED'){const rr=await fetchPinnedHttps(responseUrl,{headers:{Authorization:`Key ${c.key}`},signal:timeout(20000,input.deadlineAt),allowHosts:['queue.fal.run']});result=await json(rr,c.key);break}if(s.status==='FAILED')throw new Error('fal image generation failed.')}
  if(!result)throw new Error('fal image generation is still processing. Retry later.');const out=[];
  for(const [i,item] of (result.images||[]).slice(0,input.count).entries()){const url=String(item.url||'');if(!url.startsWith('https://')||!(new URL(url).hostname==='fal.media'||new URL(url).hostname.endsWith('.fal.media')))continue;const r=await fetchPinnedHttps(url,{signal:timeout(20000,input.deadlineAt),allowHosts:['fal.media']});if(!r.ok)continue;const mime=(r.headers.get('content-type')||item.content_type||'image/png').split(';')[0];if(!IMAGE_MIME.test(mime))continue;out.push(normalizeImage((await readImageBytes(r)).toString('base64'),mime,i+1))}return out;
}
export async function generateImage(c,input){switch(c.provider){case'openai':return openAI(c,input);case'stability':return stability(c,input);case'black-forest-labs':return bfl(c,input);case'replicate':return replicate(c,input);case'fal':return fal(c,input);default:throw new Error(`Image adapter for ${c.provider} is not implemented.`)}}
