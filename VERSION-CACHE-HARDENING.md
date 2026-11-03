# Deployment freshness and stale-cache hardening

This release is configured to avoid serving an old PotHub application shell after a deployment:

- The document shell, `/sw.js`, `/manifest.webmanifest`, and API responses send no-cache/no-store directives.
- The service worker uses `updateViaCache: 'none'`, fetches navigation documents with `cache: 'no-store'`, and never serves Next.js JavaScript/CSS chunks from Cache Storage.
- Every build stamps the service worker with a deployment/commit ID, changing the shell cache namespace. Activation removes previous `pothub-*` caches.
- `DeploymentUpdateNotice` is mounted in the app. On web/PWA, it checks `/api/version` on startup and resume, clears old PotHub caches on a detected mismatch, and reloads at most once per live build.
- Build detection compares deployment IDs with deployment IDs, or commit SHAs with commit SHAs. This avoids false mismatches between Vercel deployments and local/Capacitor builds.
- Next.js hashed static assets may retain immutable caching because their filenames are content-hashed; the new HTML references the current asset hashes.

## Important limitation

A browser/PWA can fetch and reload the current web deployment. A standalone Capacitor APK contains its own bundled frontend; server-side cache headers cannot replace that packaged UI. When a new native frontend is released, users must install/update the APK unless the app is deliberately configured to load its UI remotely.
