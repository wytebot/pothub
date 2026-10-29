# Pothub browser authentication flows

## Developer — GitHub

1. The workspace chooser opens a separate **Connect GitHub** screen. Its button navigates the browser directly to `/api/auth/github`.
2. GitHub sign-in is implemented in dedicated Next.js serverless handlers (`pages/api/auth/github.js` and `pages/api/auth/github/callback.js`), not the large Express catch-all. The start handler creates state and PKCE values, then redirects to GitHub. The callback validates state, exchanges the code server-side, retrieves the profile, and initializes the account.
3. For browser sign-in, the callback stores the authenticated session in Firestore using a SHA-256 hash of a random opaque session ID. It sets an HttpOnly, Secure-in-production, SameSite=Lax `pothub_sid` cookie and redirects to `/?connected=github`. The browser never receives the GitHub access token. Firebase Authentication is not used for Developer sign-in.
4. The dedicated `/api/auth/me` handler restores the user and role from the opaque cookie-backed session. A legacy ticket endpoint remains for compatibility, and the Capacitor build retains its custom-scheme native handoff.

## Creator — Google

1. The workspace chooser opens a separate **Sign in with Google** screen.
2. The button uses Firebase Auth's `signInWithRedirect` directly. Firebase sends the browser to the configured Firebase Auth domain and Google's consent/sign-in flow; Pothub does not call `/api/auth/google-session` from the browser flow.
3. After returning, the frontend gets the Firebase ID token and sends it as a Bearer token on API requests. The dedicated `/api/auth/me` handler and backend session resolver verify the token with Firebase Admin, provision the Creator profile/initial credits once, and return the user and credit balance. The raw ID token is held only in runtime memory and is never written to local/session storage.
4. Native Android keeps the existing backend Google OAuth flow. GitHub login clears any stale Google redirect state and signs out an old Firebase browser identity before opening GitHub, so the providers cannot cross-trigger one another.


## Deployment notes

- Keep `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` server-side in Vercel. `SESSION_SECRET` must be at least 32 characters. Set `APP_URL` separately for every Vercel environment (Production, Preview, and Development); it must be that deployment’s HTTPS API origin. Do not derive OAuth callback URLs from `VERCEL_PROJECT_PRODUCTION_URL`, because Preview state cookies and callbacks must stay on the same deployment. Set `FRONTEND_URL` to the matching frontend origin in each production environment. When APP_URL or FRONTEND_URL is unset or invalid, the dedicated GitHub handlers fall back to the request host; explicit values must match the active deployment and registered OAuth callback.
- Firestore must be configured and reachable because browser sessions and their provider credentials are stored server-side there; only a hash of the opaque session ID is used as the document key.
- For the direct cookie-backed browser flow, serve the frontend and API on the same origin (recommended) or at least on the same site so the HttpOnly `SameSite=Lax` session cookie is sent with credentialed API requests. If frontend and API are on separate origins, set `FRONTEND_URL` and `APP_ORIGIN` to the exact frontend origin and `NEXT_PUBLIC_API_BASE` to the API origin; truly cross-site deployments may block cookies and should use a same-site frontend/API deployment rather than weakening session-cookie protections. CORS allows `APP_ORIGIN` and `FRONTEND_URL` (with `APP_ORIGIN` taking precedence for the health summary) and `/api/health` reports origin mismatch and Firebase Admin status. Configure `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to the app’s own hostname when using the Firebase `/__/auth/*` proxy; add that hostname under Firebase Authentication → Authorized domains, redeploy, then check `curl -I https://YOUR-HOST/__/auth/iframe` for a non-404 response.
- Firebase's web SDK configuration is public project configuration and remains hardcoded in `src/lib/firebase.js`; it is not a substitute for backend Firebase Admin credentials.

## GitHub permissions and repository write features

The GitHub authorization request currently retains `repo read:user user:email`. `read:user` and `user:email` identify the user; the `repo` scope is required for private-repository access and the current `POST /api/github/commit-fix` and `POST /api/github/create-pr` operations (creating branches/commits and pull requests). Removing `repo` would reduce permissions, but those two features would fail until an explicit repository-write permission reauthorization flow is implemented. The browser session keeps the access token server-side in Firestore; the browser only receives an HttpOnly opaque session cookie.
