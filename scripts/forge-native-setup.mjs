import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.FORGE_SOURCE_DIR||'source');
const raw=process.env.FORGE_NATIVE_FEATURES||'';
const features=[...new Set(raw.split(',').map(x=>x.trim()).filter(Boolean))];
const supported=new Set(['camera','location','push','local-notifications','biometrics','files','share','haptics','network','clipboard']);
const selected=features.filter(x=>supported.has(x));
const packages={camera:'@capacitor/camera',location:'@capacitor/geolocation',push:'@capacitor/push-notifications','local-notifications':'@capacitor/local-notifications',biometrics:'@aparajita/capacitor-biometric-auth',files:'@capacitor/filesystem',share:'@capacitor/share',haptics:'@capacitor/haptics',network:'@capacitor/network',clipboard:'@capacitor/clipboard'};
if(!selected.length){console.log('No optional native feature plugins selected.');process.exit(0);}
const cap=fs.existsSync(path.join(root,'capacitor.config.ts'))||fs.existsSync(path.join(root,'capacitor.config.js'))||fs.existsSync(path.join(root,'capacitor.config.json'))||fs.existsSync(path.join(root,'android'));
if(!cap){console.log('Native feature selections requested but framework is not Capacitor/Android. Generated compatibility report only; no packages installed.');}
const pkg=path.join(root,'package.json');
if(cap&&fs.existsSync(pkg)){
 const chosen=selected.map(f=>packages[f]).filter(Boolean);
 if(chosen.length){const manifest=JSON.parse(fs.readFileSync(pkg,'utf8'));const versions={'@capacitor/camera':'^6.0.0','@capacitor/geolocation':'^6.0.0','@capacitor/push-notifications':'^6.0.0','@capacitor/local-notifications':'^6.0.0','@capacitor/filesystem':'^6.0.0','@capacitor/share':'^6.0.0','@capacitor/haptics':'^6.0.0','@capacitor/network':'^6.0.0','@capacitor/clipboard':'^6.0.0','@aparajita/capacitor-biometric-auth':'^6.0.0'};manifest.dependencies={...(manifest.dependencies||{}),...Object.fromEntries(chosen.map(p=>[p,manifest.dependencies?.[p]||versions[p]]))};fs.writeFileSync(pkg,JSON.stringify(manifest,null,2)+'\n');}
}
const permissions={camera:['android.permission.CAMERA'],location:['android.permission.ACCESS_COARSE_LOCATION','android.permission.ACCESS_FINE_LOCATION'],push:['android.permission.POST_NOTIFICATIONS'],'local-notifications':['android.permission.POST_NOTIFICATIONS'],biometrics:['android.permission.USE_BIOMETRIC','android.permission.USE_FINGERPRINT'],files:[],share:[],haptics:['android.permission.VIBRATE'],network:['android.permission.ACCESS_NETWORK_STATE'],clipboard:[]};
const manifest=path.join(root,'android','app','src','main','AndroidManifest.xml');
if(cap&&fs.existsSync(manifest)){
 if(selected.includes('camera')&&!/android.hardware.camera/.test(fs.readFileSync(manifest,'utf8'))){const cameraFeature='<uses-feature android:name=\"android.hardware.camera\" android:required=\"false\" />';fs.writeFileSync(manifest,fs.readFileSync(manifest,'utf8').replace(/<manifest[^>]*>/,m=>`${m}\n    ${cameraFeature}`));}
 let xml=fs.readFileSync(manifest,'utf8');
 const requested=[...new Set(selected.flatMap(f=>permissions[f]||[]))];
 for(const perm of requested){const tag=`<uses-permission android:name="${perm}" />`;if(!xml.includes(`android:name="${perm}"`)){xml=xml.replace(/<manifest[^>]*>/,m=>`${m}\n    ${tag}`);}}
 fs.writeFileSync(manifest,xml);
}
const bridgeMethods={
 camera:`export async function captureCameraPhoto(){const {Camera,CameraResultType}=await import('@capacitor/camera');return Camera.getPhoto({quality:85,resultType:CameraResultType.Uri,allowEditing:false});}`,
 location:`export async function getCurrentLocation(){const {Geolocation}=await import('@capacitor/geolocation');return Geolocation.getCurrentPosition({enableHighAccuracy:true,timeout:15000});}`,
 push:`export async function registerPushNotifications(){const {PushNotifications}=await import('@capacitor/push-notifications');const permission=await PushNotifications.requestPermissions();if(permission.receive==='granted')await PushNotifications.register();return permission;}`,
 'local-notifications':`export async function requestLocalNotificationPermission(){const {LocalNotifications}=await import('@capacitor/local-notifications');return LocalNotifications.requestPermissions();}\nexport async function scheduleLocalNotification(title:string,body:string,id=1){const {LocalNotifications}=await import('@capacitor/local-notifications');return LocalNotifications.schedule({notifications:[{id,title,body,scheduledAt:new Date(Date.now()+1000)}]});}`,
 biometrics:`export async function authenticateBiometric(reason='Confirm your identity'){const {BiometricAuth}=await import('@aparajita/capacitor-biometric-auth');return BiometricAuth.authenticate({reason});}`,
 files:`export async function readNativeFile(path:string){const {Filesystem,Directory}=await import('@capacitor/filesystem');return Filesystem.readFile({path,directory:Directory.Documents});}\nexport async function writeNativeFile(path:string,data:string){const {Filesystem,Directory}=await import('@capacitor/filesystem');return Filesystem.writeFile({path,data,directory:Directory.Documents});}`,
 share:`export async function shareNativeContent(title:string,text:string,url?:string){const {Share}=await import('@capacitor/share');return Share.share({title,text,url});}`,
 haptics:`export async function vibrateNative(style:'light'|'medium'|'heavy'='light'){const {Haptics,ImpactStyle}=await import('@capacitor/haptics');return Haptics.impact({style:style==='heavy'?ImpactStyle.Heavy:style==='medium'?ImpactStyle.Medium:ImpactStyle.Light});}`,
 network:`export async function getNetworkStatus(){const {Network}=await import('@capacitor/network');return Network.getStatus();}`,
 clipboard:`export async function writeClipboardText(text:string){const {Clipboard}=await import('@capacitor/clipboard');return Clipboard.write({string:text});}\nexport async function readClipboardText(){const {Clipboard}=await import('@capacitor/clipboard');return Clipboard.read();}`,
};
const bridge=selected.map(f=>bridgeMethods[f]).filter(Boolean).join('\n\n');
if(cap&&bridge){const srcDir=fs.existsSync(path.join(root,'src'))?path.join(root,'src'):root;fs.writeFileSync(path.join(srcDir,'monygist-native-capabilities.ts'),`// Generated by MonyGist Forge from the selected build capabilities.\n// Review permission UX and invoke only APIs needed by your app.\n${bridge}\n`);}
const readme=`# Native capability selection\n\nRequested by cloud build: ${selected.join(', ')||'none'}\n\nFor Capacitor projects, compatible plugins are added to package.json, Android manifest permissions are added, and a ready-to-call \`monygist-native-capabilities.ts\` bridge is generated for selected APIs. The bridge exposes functions for camera, GPS, push/local notifications, biometrics, files, share, haptics, network status and clipboard where selected. **The project must still connect these methods to its screens, explain permissions to users, and add platform-specific setup such as Firebase push credentials.**\n\n${selected.map(f=>`- ${f}: ${packages[f]||'built-in Capacitor plugin'}${(permissions[f]||[]).length?`; permissions: ${(permissions[f]||[]).join(', ')}`:''}`).join('\n')}\n\nFor non-Capacitor projects the worker records selections in the manifest/report but does not inject incompatible plugins. Verify privacy policy, runtime permission flows and Play Console declarations before release.\n`;
fs.writeFileSync(path.join(root,'MONYGIST-NATIVE-CAPABILITIES.md'),readme);
fs.writeFileSync(path.join(root,'monygist-native-capabilities.json'),JSON.stringify({requested:selected,detectedCapacitor:cap,permissions:Object.fromEntries(selected.map(f=>[f,permissions[f]||[]])),packages:Object.fromEntries(selected.filter(f=>packages[f]).map(f=>[f,packages[f]]))},null,2)+'\n');
console.log(`Native feature preparation complete: ${selected.join(', ')}`);
