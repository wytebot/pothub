# Pothub browser authentication flows

## Developer — GitHub

1. The Developer button navigates the browser to `/api/auth/github`.
2. The backend generates OAuth state and PKCE values and redirects to GitHub's real authorization page.
3. GitHub returns to `/api/auth/github/callback` on the backend origin. The backend validates state, exchanges the code server-side, reads the GitHub profile, and initializes the account.
4. For browser sign-in, the backend creates an opaque random handoff ID and stores a short-lived sealed session against its SHA-256 hash in Firestore. Only the opaque ID is sent to the frontend as `auth_ticket`. The ticket expires after two minutes and is transactionally deleted when exchanged.
5. The frontend removes the ticket from browser history before exchanging it at `/api/auth/browser-exchange`. For GitHub browser sign-in, the browser stores only an opaque random session ID in `sessionStorage`; the server stores the session and GitHub access token in Firestore under the SHA-256 hash of that ID. API requests send the opaque ID as a bearer token. The raw GitHub token is never returned to the browser or stored in browser storage. Logout clears the browser ID and the HttpOnly cookie. The GitHub client secret and access token are never placed in frontend configuration.
6. Native Capacitor sign-in keeps its existing custom-scheme, one-time ticket exchange flow.

## Creator — Google

Browser sign-in uses Firebase Auth's popup flow. After Firebase returns a Google identity, the frontend obtains a Firebase ID token and sends it to `/api/auth/google-session`. The backend verifies the ID token with Firebase Admin, provisions the profile, and returns a sealed backend session. If a browser blocks the popup, the frontend falls back to Firebase redirect; redirect results are consumed before the app decides to show the signed-out welcome page. Native Android keeps the backend Google OAuth flow.

## Deployment notes

- Keep `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` server-side in Vercel. `SESSION_SECRET` must be at least 32 characters. Set `APP_URL` separately for every Vercel environment (Production, Preview, and Development); it must be that deployment’s HTTPS API origin. Do not derive OAuth callback URLs from `VERCEL_PROJECT_PRODUCTION_URL`, because Preview state cookies and callbacks must stay on the same deployment. Set `FRONTEND_URL` to the matching frontend origin in each production environment. Production OAuth fails closed when either required URL is missing.
- Firestore must be configured and reachable because the browser handoff ticket is stored there and consumed exactly once.
- If frontend and API are on separate origins, set `FRONTEND_URL` and `APP_ORIGIN` to the exact frontend origin and `VITE_API_BASE` to the API origin. CORS allows `APP_ORIGIN` and `FRONTEND_URL` (with `APP_ORIGIN` taking precedence for the health summary) and `/api/health` reports origin mismatch and Firebase Admin status. Configure `VITE_FIREBASE_AUTH_DOMAIN` to the app’s own hostname when using the Firebase `/__/auth/*` proxy; add that hostname under Firebase Authentication → Authorized domains, redeploy, then check `curl -I https://YOUR-HOST/__/auth/iframe` for a non-404 response.
- Firebase's web SDK configuration is public project configuration and remains hardcoded in `src/lib/firebase.js`; it is not a substitute for backend Firebase Admin credentials.

## GitHub permissions and repository write features

The GitHub authorization request currently retains `repo read:user user:email`. `read:user` and `user:email` identify the user; the `repo` scope is required for private-repository access and the current `POST /api/github/commit-fix` and `POST /api/github/create-pr` operations (creating branches/commits and pull requests). Removing `repo` would reduce permissions, but those two features would fail until an explicit repository-write permission reauthorization flow is implemented. The browser session now keeps the access token server-side in Firestore; only the opaque session ID reaches browser storage.
