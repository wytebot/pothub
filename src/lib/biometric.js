import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const STORAGE_KEY = 'pothub-api-page-biometric-v1';
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url = (value) => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
const random = (n=32) => crypto.getRandomValues(new Uint8Array(n));

export async function biometricAvailable() {
  if (Capacitor.isNativePlatform()) {
    try { const r = await NativeBiometric.isAvailable(); return {available: !!r.isAvailable, reason: r.isAvailable ? '' : 'Biometric verification is unavailable on this device.'}; }
    catch { return {available:false,reason:'Native biometric verification is unavailable.'}; }
  }
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) return {available:false,reason:'Device verification requires HTTPS and a supported platform authenticator.'};
  try { const supported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); return {available:supported,reason:supported?'':'No platform authenticator is available in this browser.'}; }
  catch { return {available:false,reason:'This browser cannot verify a platform authenticator.'}; }
}
async function nativeVerify() {
  const r = await NativeBiometric.isAvailable();
  if (!r.isAvailable) throw new Error('Biometric verification is unavailable on this device.');
  await NativeBiometric.verifyIdentity({reason:'Unlock Pothub API keys',title:'Verify identity',subtitle:'API page access',description:'Confirm it is you to view or change agent settings.',negativeButtonText:'Cancel'});
}
async function browserRegister() {
  const challenge=random(); const userId=random(16);
  const credential=await navigator.credentials.create({publicKey:{challenge,rp:{name:'Pothub',id:location.hostname},user:{id:userId,name:'pothub-api-page',displayName:'Pothub API page'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000,attestation:'none'}});
  if(!credential) throw new Error('Device verification setup was cancelled.');
  const row={id:b64url(credential.rawId),createdAt:Date.now(),rpId:location.hostname};
  await (await import('./db')).db.settings.put({key:STORAGE_KEY,value:row});
  return row;
}
async function browserVerify() {
  const {db}=await import('./db'); let row=await db.settings.get(STORAGE_KEY);
  if(!row?.value?.id) row={value:await browserRegister()};
  const credential=await navigator.credentials.get({publicKey:{challenge:random(),rpId:row.value.rpId,allowCredentials:[{type:'public-key',id:fromB64url(row.value.id)}],userVerification:'required',timeout:60000}});
  if(!credential) throw new Error('Device verification was cancelled.');
  return true;
}
export async function verifyApiPage(){ if(Capacitor.isNativePlatform()) return nativeVerify(); return browserVerify(); }
export async function enableApiPageBiometric(){const a=await biometricAvailable();if(!a.available)throw new Error(a.reason);await verifyApiPage();const {db}=await import('./db');const old=await db.settings.get(STORAGE_KEY);await db.settings.put({key:STORAGE_KEY,value:{...(old?.value||{}),enabled:true,createdAt:Date.now()}});return true;}
export async function disableApiPageBiometric(){await verifyApiPage();const {db}=await import('./db');await db.settings.delete(STORAGE_KEY);return true;}
export async function apiPageBiometricEnabled(){const {db}=await import('./db');const row=await db.settings.get(STORAGE_KEY);return !!row?.value?.enabled;}
