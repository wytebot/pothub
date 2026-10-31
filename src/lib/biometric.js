import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const STORAGE_KEY = 'pothub-api-page-biometric-v1';
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url = (value) => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
const random = (n=32) => crypto.getRandomValues(new Uint8Array(n));
const equal = (a,b) => a.length===b.length && a.every((v,i)=>v===b[i]);
async function settings(){return (await import('./db')).db}
async function readLock(){const db=await settings();return (await db.settings.get(STORAGE_KEY))?.value||null}
async function writeLock(value){const db=await settings();await db.settings.put({key:STORAGE_KEY,value})}
async function pinDigest(pin,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:310000},material,256))}
async function apiSecurity(path,body){const base=process.env.NEXT_PUBLIC_API_BASE||'';const response=await fetch(`${base}/api/security/${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Security verification failed.');return data;}
async function setupPin(){const first=window.prompt('Set a device passcode (6–12 digits) for API & Agents access.');if(first===null)throw new Error('Passcode setup was cancelled.');if(!/^\d{6,12}$/.test(first))throw new Error('Use a passcode containing 6–12 digits.');const second=window.prompt('Confirm your device passcode.');if(second!==first)throw new Error('The passcodes did not match.');if(!Capacitor.isNativePlatform()){await apiSecurity('pin/setup',{pin:first});await writeLock({enabled:true,mode:'pin',serverVerified:true,createdAt:Date.now()});return true}const salt=random(16),digest=await pinDigest(first,salt);await writeLock({enabled:true,mode:'pin',salt:b64url(salt),pinHash:b64url(digest),failures:0,lockedUntil:0,createdAt:Date.now()});return true}
async function verifyPin(){const row=await readLock();if(!row?.pinHash&&!row?.serverVerified)throw new Error('No device passcode is configured. Disable and re-enable Fingerprint lock to set one.');const now=Date.now();if(Number(row.lockedUntil)>now)throw new Error(`Passcode attempts are temporarily paused. Try again in ${Math.ceil((row.lockedUntil-now)/1000)} seconds.`);const pin=window.prompt('Enter your API & Agents device passcode.');if(pin===null)throw new Error('Verification was cancelled.');if(!Capacitor.isNativePlatform()&&row.serverVerified){await apiSecurity('pin/verify',{pin});await writeLock({...row,lastVerifiedAt:now});return true}const digest=await pinDigest(pin,fromB64url(row.salt));if(!equal(digest,fromB64url(row.pinHash))){const failures=(Number(row.failures)||0)+1;await writeLock({...row,failures,lockedUntil:failures>=5?now+300000:0});throw new Error(failures>=5?'Too many incorrect passcodes. Try again in five minutes.':'Incorrect passcode. Try again.')}await writeLock({...row,failures:0,lockedUntil:0,lastVerifiedAt:now});return true}
function credentialJSON(credential){const response=credential.response;const out={id:credential.id,rawId:b64url(credential.rawId),type:credential.type,clientExtensionResults:credential.getClientExtensionResults?.()||{}};if(response.attestationObject){out.response={clientDataJSON:b64url(response.clientDataJSON),attestationObject:b64url(response.attestationObject),transports:response.getTransports?.()||[]}}else{out.response={clientDataJSON:b64url(response.clientDataJSON),authenticatorData:b64url(response.authenticatorData),signature:b64url(response.signature),userHandle:response.userHandle?b64url(response.userHandle):null}}return out;}
async function browserRegister(){const options=await apiSecurity('webauthn/register/options');const publicKey={...options,challenge:fromB64url(options.challenge),user:{...options.user,id:fromB64url(options.user.id)},excludeCredentials:(options.excludeCredentials||[]).map(x=>({...x,id:fromB64url(x.id)}))};const credential=await navigator.credentials.create({publicKey});if(!credential)throw new Error('Device verification setup was cancelled.');const result=await apiSecurity('webauthn/register/verify',{response:credentialJSON(credential)});const first=window.prompt('Set a 6–12 digit fallback passcode in case biometrics are unavailable.');if(first===null||!/^[0-9]{6,12}$/.test(first))throw new Error('A 6–12 digit fallback passcode is required.');const second=window.prompt('Confirm your fallback passcode.');if(second!==first)throw new Error('The passcodes did not match.');await apiSecurity('pin/setup',{pin:first});const row={id:result.credentialId,createdAt:Date.now(),rpId:location.hostname,enabled:true,mode:'webauthn',hasPin:true,serverVerified:true};await writeLock(row);return row;}
async function browserVerify(){const options=await apiSecurity('webauthn/auth/options');const publicKey={...options,challenge:fromB64url(options.challenge),allowCredentials:(options.allowCredentials||[]).map(x=>({...x,id:fromB64url(x.id)}))};const credential=await navigator.credentials.get({publicKey});if(!credential)throw new Error('Device verification was cancelled.');await apiSecurity('webauthn/auth/verify',{response:credentialJSON(credential)});return true;}

export async function biometricAvailable() {
  if (Capacitor.isNativePlatform()) {
    try { const r = await NativeBiometric.isAvailable(); return {available: !!r.isAvailable, reason: r.isAvailable ? '' : 'Biometrics unavailable. You can use a local device passcode instead.'}; }
    catch { return {available:false,reason:'Native biometrics unavailable. You can use a local device passcode instead.'}; }
  }
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) return {available:false,reason:'WebAuthn is unavailable here. You can use a local device passcode instead.'};
  try { const supported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); return {available:supported,reason:supported?'':'No platform authenticator is available. You can use a local device passcode instead.'}; }
  catch { return {available:false,reason:'This browser cannot access a platform authenticator. You can use a local device passcode instead.'}; }
}
async function nativeVerify() {
  const r = await NativeBiometric.isAvailable();
  if (!r.isAvailable) throw new Error('Biometric verification is unavailable on this device.');
  await NativeBiometric.verifyIdentity({reason:'Unlock Pothub API keys',title:'Verify identity',subtitle:'API & Agents',description:'Confirm it is you to view or change agent settings.',negativeButtonText:'Cancel'});
}

export async function verifyApiPage(){
  const available=await biometricAvailable();
  if(!available.available)return verifyPin();
  if(Capacitor.isNativePlatform())return nativeVerify();
  try{return await browserVerify()}catch(e){const row=await readLock();if(row?.serverVerified)return verifyPin();throw e}
}
export async function enableApiPageBiometric(){
  const available=await biometricAvailable();
  if(!available.available)return setupPin();
  if(Capacitor.isNativePlatform()){await nativeVerify();await writeLock({enabled:true,mode:'native',createdAt:Date.now(),failures:0,lockedUntil:0});return true;}
  await browserRegister();return true;
}
export async function disableApiPageBiometric(){await verifyApiPage();if(!Capacitor.isNativePlatform())await apiSecurity('lock/disable');const db=await settings();await db.settings.delete(STORAGE_KEY);return true;}
export async function apiPageBiometricEnabled(){const row=await readLock();return !!row?.enabled;}
