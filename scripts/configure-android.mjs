import fs from 'node:fs';
import path from 'node:path';
const manifest='android/app/src/main/AndroidManifest.xml';
if(!fs.existsSync(manifest)){
  console.log('Android project is not generated yet. After dependencies install, run `npx cap add android`, then `npm run android:configure` again. No native configuration was changed.');
  process.exit(0);
}
let xml=fs.readFileSync(manifest,'utf8');
if(!xml.includes('android:scheme="ai.pothub.app"')){
 const marker='</activity>',pos=xml.indexOf(marker);
 if(pos<0)throw new Error('Could not locate MainActivity closing </activity> in AndroidManifest.xml');
 const filter='\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="ai.pothub.app" android:host="auth" />\n            </intent-filter>\n        ';
 xml=xml.slice(0,pos)+filter+xml.slice(pos);
}
if(!xml.includes('android.permission.WRITE_EXTERNAL_STORAGE')) xml=xml.replace('<manifest ', '<manifest ').replace(/(<manifest[^>]*>)/, '$1\n    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />');
fs.writeFileSync(manifest,xml);
const template='android-template/app/src/main/java/app/kithub/ai/PublicDownloadsPlugin.java';
const target='android/app/src/main/java/app/kithub/ai/PublicDownloadsPlugin.java';
fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(template,target);
const candidates=['android/app/src/main/java/app/kithub/ai/MainActivity.java'];
for(const f of candidates){if(!fs.existsSync(f))continue;let s=fs.readFileSync(f,'utf8');if(!s.includes('PublicDownloadsPlugin.class')){s=s.replace(/(public class MainActivity extends BridgeActivity\s*\{)/, '$1\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(PublicDownloadsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }');fs.writeFileSync(f,s);}}
console.log('Configured Pothub deep link and PublicDownloads MediaStore plugin template. Verify the generated Android package name matches app.kithub.ai before building.');
