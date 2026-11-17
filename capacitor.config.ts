import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  // Must match the Android package registered in Firebase (google-services.json).
  appId: 'app.pothubself.vercel',
  appName: 'Pothub',
  webDir: 'dist',
  backgroundColor: '#0d0d0d',
  android: { allowMixedContent: false },
  plugins: {
    // Native Google account picker (no redirect, no browser). The idToken is handed to the Firebase JS SDK,
    // so the web layer and the native layer share one signed-in user.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
  },
};
export default config;
