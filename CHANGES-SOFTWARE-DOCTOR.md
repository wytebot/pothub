# Software Doctor integration update

- Reframed the primary landing route as Repositories and added Vercel deployments, while retaining Codelab, AI Providers, Billing and Settings navigation.
- Added authenticated GitHub repository/workflow/run APIs, real run metadata, GitHub log archive links and workflow dispatch.
- Added Firestore-owned Doctor job records, signed workflow completion callbacks and job polling.
- Added a GitHub Actions diagnostic workflow template that checks out the exact commit SHA, captures failed-run logs where available, runs declared Node checks and uploads evidence.
- Added Vercel deployment lookup protected by a project-ID allowlist.
- Added environment-variable and repository setup documentation.

## Verification status

- Changed TypeScript/TSX files passed TypeScript transpile/syntax checks.
- GitHub Actions workflow YAML parsed successfully and each shell `run` block passed `bash -n`.
- Full application build/typecheck and automated test suite were not run: dependency installation timed out and `node_modules` is unavailable in this environment.
- This update is not a claim that automated AI patch generation, approved repair diffs, repair branch/PR creation, Vercel build-log retrieval, per-user Vercel OAuth, or full entitlement metering are complete. See `SOFTWARE-DOCTOR-SETUP.md`.

## Follow-up compatibility and plan cleanup

- Removed the Team plan from customer-facing billing and from new server-side price configuration. Only Free, Pro (USD 5.99/month) and Pro+ (USD 9.99/month) are offered.
- Existing legacy Team entitlements are normalized to Pro+ so removing the offer does not unexpectedly downgrade already-paid accounts.
- Corrected Codelab's repository listing so it no longer truncates free users to ten repositories; the Software Doctor's server-side selected-repository gate remains authoritative at 2 Free / 10 Pro / unlimited Pro+.
- Updated the plan and privacy wording to remove Team references and accurately disclose encrypted background-job payload retention.
- Added responsive safe-area, dynamic viewport, touch-target and reduced-motion adjustments for browser and Capacitor layouts; preserved the existing mobile slide-out navigation rather than replacing it with a second navigation system.
