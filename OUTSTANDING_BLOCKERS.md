# Outstanding blocker status

## What is now wired

- GitHub Actions resolves the dependency graph on a networked runner and creates a complete npm lockfile.
- The lockfile workflow validates that file using a clean `npm ci` and uploads it as `pothub-package-lock`.
- The production deployment workflow repeats dependency resolution and clean-install validation, runs the full test suite, runs both the Next.js production build and Capacitor static export, and only then invokes the pinned Vercel CLI deployment.
- Any dependency, test, PDF.js worker, web-build, or Capacitor-build failure now stops deployment.

## What still requires a networked GitHub Actions run

This editing environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`). Therefore it cannot honestly generate or validate `package-lock.json`, install `express`/`firebase-admin`/`typescript`/`pdfjs-dist`, run the dependency-backed tests, or execute either production build. The missing `pdf.worker.mjs` is provided by the installed `pdfjs-dist` package and is expected to appear after a successful install.

Run **Actions → Generate Pothub npm lockfile → Run workflow**. Download the `pothub-package-lock` artifact and commit `package-lock.json`. Then push; the production workflow will run the full gate and deploy only if every step passes.

No live provider, Flutterwave, Firebase, Vercel, DNS-rebinding lab, or physical Android tests are represented as passed by this patch.


## Product-scope update

Pothub no longer includes the separate Vercel diagnostics OAuth integration. Vercel remains the deployment host. Do not configure a Vercel OAuth callback URL or Vercel OAuth client secrets for this release. Developer diagnostics now use GitHub repository and Actions data directly.

## Persistence and biometric follow-up checks

The latest source pass adds account-partitioned local caching and biometric/PIN fallback hardening. Focused regression tests pass 10/10; the static release audit and JS/JSX syntax checks pass. The full suite currently reports 64 passed and 16 dependency-resolution failures because this environment has no `node_modules`. A fresh `npm install` attempt timed out; `npm run build` therefore stops before Next.js compilation because `pdfjs-dist/legacy/build/pdf.worker.mjs` is not installed. Physical Android biometric and live two-account Firestore tests are still required.
