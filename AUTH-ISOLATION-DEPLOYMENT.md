# Pothub auth isolation — deployment checklist

This patch intentionally changes only authentication routing and its diagnostics. Existing workspace features, billing, Firestore account/credit storage, and the separate Capacitor native flow are retained.

## Browser pages

- **Developer** → separate “Connect GitHub” page → `GET /api/auth/github` → GitHub OAuth → `GET /api/auth/github/callback` → secure `pothub_sid` cookie → Creator/Developer app restore through `GET /api/auth/me`.
- **Creator** → separate “Sign in with Google” page → Firebase Auth `signInWithRedirect` directly through the configured Firebase `authDomain`. The browser no longer calls `/api/auth/google-session`. The Firebase ID token is kept in runtime memory and sent as a Bearer token for protected API requests; the backend verifies it with Firebase Admin and initializes the Creator profile/credits in Firestore.
- GitHub auth start, GitHub callback, `/api/auth/me`, and `/api/health` are dedicated Next.js API routes. They do not import the large Express app as their route handler, so an Express startup failure cannot directly turn these endpoints into Vercel's default HTML 500 page.

## Required console settings

### Vercel environment variables

Set these for the Production environment and redeploy:

- `APP_URL=https://pothub-self.vercel.app`
- `FRONTEND_URL=https://pothub-self.vercel.app`
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for the same GitHub OAuth App
- `SESSION_SECRET` to a random secret of at least 32 characters
- `FIREBASE_SERVICE_ACCOUNT_JSON` with the service-account JSON (or the supported base64 form) and access to the existing Firestore database

The dedicated GitHub route falls back to the incoming request host if `APP_URL` or `FRONTEND_URL` is unset/invalid. Explicit production URLs are still preferable to avoid host/callback mismatches.

### GitHub OAuth App

Set its **Authorization callback URL** to exactly:

`https://pothub-self.vercel.app/api/auth/github/callback`

### Firebase and Google Cloud

- In Firebase Console → Authentication → Settings → Authorized domains, ensure `pothub-self.vercel.app` is present.
- The Firebase web configuration in `src/lib/firebase.js` currently uses `pothub-ca2a1.firebaseapp.com` as `authDomain`. With that value unchanged, the Google OAuth authorized redirect URI is normally `https://pothub-ca2a1.firebaseapp.com/__/auth/handler`. If the Firebase `authDomain` is changed, use the corresponding `<authDomain>/__/auth/handler` URI in the Google Cloud OAuth client instead.
- Enable the Google sign-in provider in Firebase Authentication. Keep the Firebase Admin service account private in Vercel; never put it in the browser build.

## Post-deploy smoke test

1. Open `https://pothub-self.vercel.app/api/health`; it must return JSON even if Firebase initialization is unhealthy.
2. Click Start → Developer. The next page must say **Connect GitHub**. Click its button and verify the address bar goes to `github.com/login/oauth/authorize`.
3. Complete GitHub authorization. The callback should set `pothub_sid` and return to Pothub with `connected=github`.
4. Sign out, choose Creator, then click **Sign in with Google**. The browser should navigate to the configured Firebase auth domain / Google flow. It must not call `/api/auth/google-session`.
5. If Creator login succeeds but protected API calls fail, inspect `/api/health` and Vercel Runtime Logs for Firebase Admin / Firestore verification errors.

## Verification limits

The local automated source tests cover routing contracts and provider separation. They do not substitute for a live Vercel deployment, actual GitHub/Google OAuth credentials, Firebase Admin access, or an Android device test.
