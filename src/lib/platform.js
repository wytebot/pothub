import { Capacitor, registerPlugin } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { iconId, normalizeIcon } from './app-icon-data';
export const native=()=>Capacitor.isNativePlatform();
export async function openAuth(url){ if(native()) return Browser.open({url}); window.location.assign(url); }
export async function copyText(value){const text=String(value||'');try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true}}catch{}const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();if(!ok)throw new Error('Copy is unavailable in this browser. Select and copy the text manually.');return true}
export async function shareText(title,text,url){ if(native()) return Share.share({title,text,url,dialogTitle:title}); if(navigator.share){try{return await navigator.share({title,text,url})}catch(e){if(e?.name==='AbortError')return {cancelled:true}}}await copyText(url||text);return {copied:true} }
const PublicDownloads=registerPlugin('PublicDownloads');
export async function saveBlob(blob,name){ if(native()){let sessionId='';try{const session=await PublicDownloads.begin({filename:name,mimeType:blob.type||'application/octet-stream'});sessionId=session.id;const chunkSize=1024*1024;for(let offset=0;offset<blob.size;offset+=chunkSize){const part=await blob.slice(offset,Math.min(blob.size,offset+chunkSize)).arrayBuffer(),bytes=new Uint8Array(part);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));await PublicDownloads.append({id:sessionId,data:btoa(binary)})}const result=await PublicDownloads.finish({id:sessionId});return result}catch(e){if(sessionId)try{await PublicDownloads.abort({id:sessionId})}catch{}if(blob.size>20*1024*1024)throw new Error(`Could not save this large file to Android Downloads. ${e?.message||'Run npm run android:configure and rebuild the APK.'}`);const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return Filesystem.writeFile({path:name,directory:Directory.Documents,data:btoa(binary),recursive:true})}} const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }

export async function getNativeSession(){if(!native())return '';try{return (await SecureStorage.get('pothub-session-v1'))||''}catch{return ''}}
export async function setNativeSession(token){if(!native())return;await SecureStorage.set('pothub-session-v1',token)}
export async function clearNativeSession(){if(!native())return;try{await SecureStorage.remove('pothub-session-v1')}catch{}}

// Android launcher icon (Capacitor APK only). Resolves to { ok, message }.
const AppIcon=registerPlugin('AppIcon');
export async function setLauncherIcon(choice){
  if(!native())return {ok:false,unsupported:true,message:''};
  try{await AppIcon.setIcon({id:iconId(normalizeIcon(choice))});return {ok:true,message:'Android launcher icon updated. Your launcher can take a few seconds to refresh.'}}
  catch(error){const text=String(error?.message||error||'');const missing=/not implemented|not available|unimplemented/i.test(text);return {ok:false,message:missing?'This APK was built before launcher-icon support was added. Rebuild the APK to change the launcher icon; the in-app color and icon already changed.':`The launcher icon could not be changed: ${text.slice(0,140)}`}}
}
