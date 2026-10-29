# Pothub: GitHub Pages frontend + Vercel backend

## Architecture
- GitHub Pages serves only the compiled Vite/React frontend at `https://wytebot.github.io/pothub/`.
- `https://pothub-self.vercel.app` remains the backend API and is the only place where server environment variables and private credentials are read.
- `VITE_API_BASE` contains only the public backend URL; never put API keys, OAuth secrets, service-account JSON, or payment credentials in `VITE_*` variables.
- Existing API routes, Firestore/account operations, billing, AI endpoints, GitHub OAuth, Vercel OAuth and APK build paths remain in the backend/project. Vercel's existing deploy workflow is retained.

## GitHub repository setup
1. Push this project to `wytebot/pothub` on `main` (or `master`).
2. Open repository Settings → Pages and set **Build and deployment → Source** to **GitHub Actions**.
3. The `Deploy Pothub frontend to GitHub Pages` workflow builds with `/pothub/` as the base path and deploys `dist`.

## Vercel environment variables
Set these in the Vercel project's Production environment and redeploy:
- `APP_URL=https://pothub-self.vercel.app` (backend origin; GitHub OAuth callback is `https://pothub-self.vercel.app/api/auth/github/callback`).
- `FRONTEND_URL=https://wytebot.github.io/pothub/` (browser destination after authentication).
- `APP_ORIGIN=https://wytebot.github.io` (allowed browser origin; the backend also derives the origin from `FRONTEND_URL`).
- Keep existing backend-only variables already required by the app, including `SESSION_SECRET`, GitHub OAuth client credentials, Firebase Admin/Firestore configuration, AI provider keys and Flutterwave credentials. Do not move these into GitHub Pages or `VITE_*`.

Register this exact GitHub OAuth callback URL in the GitHub OAuth App settings: `https://pothub-self.vercel.app/api/auth/github/callback`. Do not register the GitHub Pages URL as the callback.

For Google sign-in, add `wytebot.github.io` to Firebase Authentication → Settings → Authorized domains. Configure the four `VITE_FIREBASE_*` values as GitHub Actions repository secrets (the Pages workflow checks them before building). The browser uses Firebase popup sign-in and exchanges the Firebase ID token with the Vercel backend. Use the Firebase web app `authDomain` value, normally `<project-id>.firebaseapp.com`, not the GitHub Pages hostname. Firebase SDK config is public client configuration, not a server secret; restrict its API key in Google Cloud where applicable.

## Browser session handoff
GitHub OAuth callback state is validated on the Vercel API. When the configured frontend is GitHub Pages, the callback returns a short-lived, single-use sealed ticket to the Pages URL. The frontend removes the ticket from browser history and exchanges it for a signed API session stored in `sessionStorage`. This avoids depending on third-party cookies between `github.io` and `vercel.app`. Protect the frontend from XSS and never log or share an `auth_ticket` URL. Native Capacitor sign-in uses its separate one-time deep-link ticket and stores the resulting session in secure storage.

## Validation
The Pages workflow runs the existing source audit and tests before deployment. The Vercel workflow remains separate and continues deploying the backend. A GitHub Actions workflow only runs after this updated project is committed and pushed; creating this ZIP does not itself update GitHub or trigger deployment.

## If GitHub says it cannot detect or publish the app
1. Confirm the repository really is `wytebot/pothub` and the default branch is `main` or `master`. The Pages URL for this project repository is `https://wytebot.github.io/pothub/` (not the account root URL).
2. Commit and push the ZIP's extracted files to the repository root. The `.github/workflows/github-pages-deploy.yml` file must be at that exact path in the repository; uploading the ZIP as a single file will not activate the workflow.
3. In **Settings → Pages**, select **GitHub Actions** as the source. Do not select “Deploy from a branch” for this workflow.
4. Open **Actions → Deploy Pothub frontend to GitHub Pages** and run it manually with **Run workflow** if no push has triggered it. Open the failed step for the actual error; the workflow now checks that the built HTML, manifest, service worker, and repository-prefixed asset paths exist before deployment.
5. In **Settings → Actions → General**, ensure Actions are enabled and the workflow has permission to deploy Pages. In **Settings → Environments**, GitHub should create/use the `github-pages` environment on deployment.
6. GitHub Pages is static hosting, not the backend. Keep `https://pothub-self.vercel.app` deployed and healthy; the frontend will not work fully if its API is unavailable.

A successful GitHub Pages deployment does not automatically configure Vercel environment variables, GitHub OAuth callback URLs, Firebase authorized domains, or the GitHub Pages source setting. Those must match the values in this document.
