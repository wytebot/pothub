# Unified Google identity and linked integrations

## What changed

- Google is the primary PotHub identity. The GitHub OAuth start endpoint now rejects standalone GitHub sign-in and requires a signed-in Google account.
- Browser GitHub linking is started with `GET /api/auth/github?link=1`. The server seals the Google user ID and PKCE verifier into the OAuth state; the callback stores the encrypted GitHub token and granted scopes in `github_connections/{sha256(googleUserId)}`.
- Capacitor linking obtains a one-time, five-minute account-link ticket from `POST /api/auth/link-ticket` while the app's SecureStorage-backed session is active. The ticket is single-use and bound server-side to the Google account. It is passed to the system browser, never a raw user ID.
- `getSession()` hydrates the encrypted linked GitHub token into the Google session for repository operations. This preserves one account identity while capabilities depend on whether GitHub is connected.
- Vercel OAuth remains stored under the same Google account's `vercel_connections/{sha256(googleUserId)}` record. The Capacitor flow uses the same one-time account-link ticket and returns through `ai.pothub.app://auth?linked=vercel`.
- `GET /api/auth/me` now reports `linkedAccounts.google`, `.github`, and `.vercel` based on server session and persisted connection state.

## Required configuration

Configure the existing server-side secrets in the Vercel project:

- `SESSION_SECRET` (at least 32 random characters)
- `POTHUB_VAULT_ENCRYPTION_KEY` (64 hex characters / 32 random bytes)
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET`
- `VERCEL_REDIRECT_URI` exactly `https://YOUR-API-ORIGIN/api/vercel/callback`
- Firebase Admin / Firestore credentials and Google/Firebase authentication settings already used by PotHub

Register the exact GitHub callback `https://YOUR-API-ORIGIN/api/auth/github/callback` and the exact Vercel callback above in their respective OAuth app settings. Do not expose OAuth client secrets or the vault key as `NEXT_PUBLIC_*` variables.

## Data migration / operational notes

- Existing standalone GitHub-created sessions remain readable for the duration of their session, but new GitHub sign-in starts are rejected. Users should sign in with Google and then link GitHub from the app.
- Existing Vercel connection records keyed to a GitHub-only user ID are not automatically merged into a Google account. Have that user sign in with Google and reconnect Vercel; this avoids guessing identity from email addresses.
- The `github_connections` collection stores only encrypted access tokens plus GitHub account metadata/scopes. Do not grant client-side reads to this collection. Firestore security rules should deny client access to `github_connections`, `vercel_connections`, `account_link_tickets`, `browser_auth_tickets`, and `native_ticket_uses`.
- OAuth `workflow` scope remains opt-in via `?workflow=1`; ordinary GitHub linking does not request it.

## Verification limits

The source syntax checks and focused static regression tests are run in the delivery environment. Live OAuth handshakes, real Firestore transactions, real Vercel deployment access, Android deep-link behavior, full npm tests, `npm ci`, production Next.js build, Capacitor export, and Android build are not certified here.
