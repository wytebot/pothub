import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  // Must match the Android package registered in Firebase (google-services.json).
  appId: 'app.pothubself.vercel',
  appName: 'MonyGist',
  webDir: 'dist',
  backgroundColor: '#0d0d0d',
  android: { allowMixedContent: false },
  plugins: {
    // Native Google account picker (no redirect, no browser). The idToken is handed to the Firebase JS SDK,
    // so the web layer and the native layer share one signed-in user.
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
    // Finished-job notifications. The icon is android-res/drawable/ic_stat_pothub.xml (copied in by android:sync).
    LocalNotifications: { smallIcon: 'ic_stat_pothub', iconColor: '#0d0d0d' },
  },
};
export default config;
