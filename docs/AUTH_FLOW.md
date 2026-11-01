# PotHub authentication flows (source-verified)

The production API is an Express app mounted through the Next.js catch-all at `pages/api/[...path].js`. There are no dedicated `pages/api/auth/*` handlers in this source tree. Keep the frontend and API same-origin where possible.

## Developer — GitHub

1. `/api/auth/github` starts OAuth/PKCE and requests `repo read:user user:email` (not `read:org`). The `repo` scope is still broad because private-repository access, branch/commit writes, PR creation, and repository mutations use it. Deleting a repository needs GitHub's `delete_repo` permission; the UI must not imply deletion is available unless an explicit reauthorization flow grants it.
2. `/api/auth/github/callback` validates the state, exchanges the code server-side, and creates a short-lived one-time handoff ticket. `/api/auth/browser-exchange` consumes that ticket once. Same-origin browser exchange sets `pothub_sid` as HttpOnly, SameSite=Lax, Secure in production; cross-origin requests receive an opaque bearer session ID. Provider tokens are encrypted with the workspace vault before being stored in Firestore `browser_sessions`.
3. Capacitor uses `ai.pothub.app://auth?code=…`; the app exchanges the one-time code for a revocable opaque server-side session ID. The native session ID is stored by the native secure-storage adapter, not a sealed GitHub-token blob. Logout revokes the opaque session server-side.

## Creator — Google

1. Browser/PWA Creator sign-in uses Firebase Auth redirect. Startup waits for `firebaseAuth.authStateReady()` before checking the restored user. Redirect intent uses a localStorage TTL and the `pothub_google_redirect=1` URL marker. `getRedirectResult` and Firebase's auth state are authoritative; a return without a user displays an actionable error.
2. `src/lib/firebase.js` selects the app's own host as `authDomain` on non-local, non-Vercel-preview hosts so `/__/auth/*` can be proxied same-origin. Localhost and Vercel previews use `pothub-ca2a1.firebaseapp.com` unless `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is explicitly set.
3. Firebase ID-token exchange is single-flight per token. A missing IndexedDB preferred-role row does not override an authenticated Google provider. Browser API requests include credentials so the same-origin session cookie is sent.
4. Capacitor uses the backend Google OAuth flow and the same one-time deep-link code handoff as GitHub. The app validates `ai.pothub.app:` and `auth`, handles error parameters, and checks `CapacitorApp.getLaunchUrl()` for cold starts.

## Firebase console configuration

- Add every production app host to Firebase Authentication → Settings → Authorized domains.
- Register the OAuth redirect URI `https://<host>/__/auth/handler` for the Firebase web handler where the OAuth client setup requires it.
- Keep the `/__/auth/:path*` rewrite to `https://pothub-ca2a1.firebaseapp.com/__/auth/:path*` and verify the route returns a non-404 response after deployment.
- Keep `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, and vault encryption configuration server-side. Firebase Web SDK config is public project config, not an authorization boundary.

## Session and deployment caveats

- `browser_sessions` uses a SHA-256 hash of the opaque session ID as its Firestore document ID and an expiry timestamp. `/api/auth/logout` deletes the matching server-side record and clears session cookies.
- Cross-site frontend/API deployments can block cookies; prefer same-origin deployment. Cross-origin native calls use an Authorization bearer header and explicit CORS allowlisting.
- OAuth, Firebase domain behavior, session revocation, and native deep-link return still require live verification with deployed configuration.
