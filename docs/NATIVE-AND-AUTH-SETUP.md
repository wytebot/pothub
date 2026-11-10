# Native features, sign-in and notifications: setup

Run `npm install`, then `npm run build:cap && npx cap sync android && GOOGLE_WEB_CLIENT_ID=<id> npm run android:configure`. Re-run configure after any clean Android regeneration.

## Google account chooser (no redirect)
1. Firebase console → Authentication → Sign-in method → Google → Web SDK configuration: copy the **Web client ID**.
2. Set `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` to it (Vercel env var and the environment used for `build:cap`). Set `GOOGLE_WEB_CLIENT_ID` to the same value when running `android:configure`.
3. Google Cloud console (same project) → Credentials → create an **Android OAuth client** for package `ai.pothub.app` with your signing key's SHA-1 (debug and release).
4. OAuth consent screen: set the app name and logo. Google shows these at the top of the chooser.
Browser sign-in uses Google's popup chooser and falls back to the redirect flow if the browser blocks popups. If the native chooser is not configured, the Android app falls back to the in-app sign-in sheet.

## GitHub and Vercel sign-in
Both open in an in-app Chrome Custom Tab and return through `ai.pothub.app://auth`. Nothing else to configure.

## Notifications
- Local notifications (reply finished while you are away) need only the permission prompt.
- The "PotHub is working" foreground notice comes from `KeepAlivePlugin`/`KeepAliveService`, installed by `android:configure`.
- Push when the app is fully closed: add Firebase `google-services.json` to the project root, re-run `android:configure`, and make sure the server's Firebase Admin credentials can use Cloud Messaging. Endpoints: `POST /api/push/register|unregister|test|reply-ready`.

## Rate limits
The global limit is 900 requests/minute/IP and the sensitive-route limit 240 writes/minute; the client waits and retries automatically on 429.
