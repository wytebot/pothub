# Pothub browser authentication flows

## Developer — GitHub

1. The Developer button navigates the browser to `/api/auth/github`.
2. The backend generates OAuth state and PKCE values and redirects to GitHub's real authorization page.
3. GitHub returns to `/api/auth/github/callback` on the backend origin. The backend validates state, exchanges the code server-side, reads the GitHub profile, and initializes the account.
4. For browser sign-in, the backend creates an opaque random handoff ID and stores a short-lived sealed session against its SHA-256 hash in Firestore. Only the opaque ID is sent to the frontend as `auth_ticket`. The ticket expires after two minutes and is transactionally deleted when exchanged.
5. The frontend removes the ticket from browser history before exchanging it at `/api/auth/browser-exchange`. The resulting sealed session is kept in `sessionStorage` and sent as a bearer token on API requests. Logout clears it. The GitHub client secret and access token are never placed in frontend configuration.
6. Native Capacitor sign-in keeps its existing custom-scheme, one-time ticket exchange flow.

## Creator — Google

Browser sign-in uses Firebase Auth's popup flow. After Firebase returns a Google identity, the frontend obtains a Firebase ID token and sends it to `/api/auth/google-session`. The backend verifies the ID token with Firebase Admin, provisions the profile, and returns a sealed backend session. If a browser blocks the popup, the frontend falls back to Firebase redirect; redirect results are consumed before the app decides to show the signed-out welcome page. Native Android keeps the backend Google OAuth flow.

## Deployment notes

- Keep `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` server-side in Vercel. `SESSION_SECRET` must be at least 32 characters.
- Firestore must be configured and reachable because the browser handoff ticket is stored there and consumed exactly once.
- If frontend and API are on separate origins, set `FRONTEND_URL` and `APP_ORIGIN` to the exact frontend origin and `VITE_API_BASE` to the API origin.
- Firebase's web SDK configuration is public project configuration and remains hardcoded in `src/lib/firebase.js`; it is not a substitute for backend Firebase Admin credentials.
