# Pothub browser authentication flows

## Developer — GitHub

1. The Developer button navigates the browser directly to `/api/auth/github`.
2. The backend generates OAuth state and PKCE values and redirects to GitHub's real authorization page. GitHub returns to `/api/auth/github/callback` on the backend origin. The backend validates state, exchanges the code server-side, reads the profile, and initializes the account.
3. For browser sign-in, the backend stores the authenticated session in Firestore using a SHA-256 hash of a randomly generated opaque session ID. It sets that ID in an HttpOnly, Secure-in-production, SameSite=Lax cookie named `pothub_sid`, then redirects directly to the frontend with `connected=github`. The browser never receives the GitHub access token.
4. The app startup calls `/api/auth/me`; that endpoint restores the user and role from the HttpOnly cookie-backed session before showing the signed-out welcome screen. The opaque session ID is not exposed to JavaScript or sessionStorage. Logout deletes the hashed Firestore session and expires the cookie. A legacy one-time browser-ticket endpoint remains for compatibility, but new browser GitHub logins use the direct callback-to-session flow.
5. Native Capacitor sign-in keeps its existing custom-scheme, one-time ticket exchange flow.

## Creator — Google

Browser sign-in uses Firebase Auth's popup flow. After Firebase returns a Google identity, the frontend obtains a Firebase ID token and sends it to `/api/auth/google-session`. The backend verifies the ID token with Firebase Admin, provisions the profile, stores a browser session server-side in Firestore, sets the same HttpOnly `pothub_sid` cookie, and returns the user and credit balance without a session token. If the browser blocks the popup, the frontend falls back to Firebase redirect; the redirect result is consumed once and establishes the same cookie-backed session. The app startup also restores the account through `/api/auth/me`, so both providers share the same simple restore path. Native Android keeps the backend Google OAuth flow.

## Deployment notes

- Keep `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` server-side in Vercel. `SESSION_SECRET` must be at least 32 characters. Set `APP_URL` separately for every Vercel environment (Production, Preview, and Development); it must be that deployment’s HTTPS API origin. Do not derive OAuth callback URLs from `VERCEL_PROJECT_PRODUCTION_URL`, because Preview state cookies and callbacks must stay on the same deployment. Set `FRONTEND_URL` to the matching frontend origin in each production environment. Production OAuth fails closed when either required URL is missing.
- Firestore must be configured and reachable because browser sessions and their provider credentials are stored server-side there; only a hash of the opaque session ID is used as the document key.
- For the direct cookie-backed browser flow, serve the frontend and API on the same origin (recommended) or at least on the same site so the HttpOnly `SameSite=Lax` session cookie is sent with credentialed API requests. If frontend and API are on separate origins, set `FRONTEND_URL` and `APP_ORIGIN` to the exact frontend origin and `NEXT_PUBLIC_API_BASE` to the API origin; truly cross-site deployments may block cookies and should use a same-site frontend/API deployment rather than weakening session-cookie protections. CORS allows `APP_ORIGIN` and `FRONTEND_URL` (with `APP_ORIGIN` taking precedence for the health summary) and `/api/health` reports origin mismatch and Firebase Admin status. Configure `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to the app’s own hostname when using the Firebase `/__/auth/*` proxy; add that hostname under Firebase Authentication → Authorized domains, redeploy, then check `curl -I https://YOUR-HOST/__/auth/iframe` for a non-404 response.
- Firebase's web SDK configuration is public project configuration and remains hardcoded in `src/lib/firebase.js`; it is not a substitute for backend Firebase Admin credentials.

## GitHub permissions and repository write features

The GitHub authorization request currently retains `repo read:user user:email`. `read:user` and `user:email` identify the user; the `repo` scope is required for private-repository access and the current `POST /api/github/commit-fix` and `POST /api/github/create-pr` operations (creating branches/commits and pull requests). Removing `repo` would reduce permissions, but those two features would fail until an explicit repository-write permission reauthorization flow is implemented. The browser session keeps the access token server-side in Firestore; the browser only receives an HttpOnly opaque session cookie.
