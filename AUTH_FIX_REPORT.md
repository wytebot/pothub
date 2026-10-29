# Pothub authentication repair

## Changes
- The app now shows only an authentication/loading screen until auth restoration finishes; no workspace page is rendered to signed-out users.
- Added a Google sign-in action using Firebase Authentication's redirect flow and restores the Firebase identity after returning to the app.
- GitHub sign-in now navigates directly to the backend `/api/auth/github` OAuth route instead of depending on a Firebase popup that may be blocked.
- Preserved the Capacitor APK's external-browser GitHub flow and native deep-link handoff.
- Added automated checks for auth gating and provider navigation.

## Verification
- `node scripts/release-audit.mjs`: passed.
- `node --test tests/*.test.mjs`: 14 tests passed.
- `npm run build`: could not run because dependencies are not installed in this environment (`vite: not found`). This is not a successful production build claim.

## Required deployment configuration
- Firebase web config: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
- Enable Google under Firebase Console → Authentication → Sign-in method and add the deployed domain under Authorized domains.
- GitHub backend OAuth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and a strong `SESSION_SECRET`; callback must match `/api/auth/github/callback` exactly.
- APK builds need `VITE_API_BASE_URL` set to the HTTPS backend origin (without `/api`) and the `ai.pothub.app` deep link configured.

## Important scope note
Google Firebase sign-in unlocks the frontend workspace. GitHub repository operations still require GitHub authorization. The current backend's credit/profile schema is GitHub-based; Google-only users need a deliberate server-side account/profile mapping before Google login can be treated as a fully provisioned billing account. Live OAuth cannot be verified without the actual Firebase/GitHub console configuration and a deployed test.
