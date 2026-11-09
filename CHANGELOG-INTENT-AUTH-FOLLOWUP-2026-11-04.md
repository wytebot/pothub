# PotHub intent, export and authentication follow-up — 2026-11-04

- Added localized file-format request verbs for the supported languages, explicit reply-language override handling, and a 338-prompt multilingual intent golden set with a regression gate for image/video/file/edit precision, recall, and media false positives.
- Added data-driven response style fragments and a single corrective generation for detectable word-count, bullet-count, JSON, and CSV constraints. The correction reuses the same operation and credit reservation.
- Added image-to-image edit-intent vocabulary. Existing image adapters only implement text-to-image generation, so attached-image edits now preserve the source and request an image-editing-capable agent instead of silently generating a replacement.
- Added XLSX and PPTX OOXML output writers using the already-declared JSZip dependency; XLSX supports Markdown tables and fenced CSV blocks, multiple sheets, typed numeric/date cells, a styled/frozen header row, widths, and formula-injection neutralisation.
- CSV exports now include a UTF-8 BOM and neutralise spreadsheet formulas.
- Added independent GitHub sign-in alongside account linking, and a Vercel OIDC sign-in route that creates a `vercel_<sub>` identity while keeping provider tokens encrypted. Explicit linking still requires the current Google identity.
- Added GitHub state scalar validation and timing-safe state comparison; native and browser session exchanges accept Vercel-only identities without requiring a GitHub token.

## Verification caveat

The environment had no installed `node_modules`, and `npm install` timed out. Pure classifier/golden/style/auth-source regression tests passed. Runtime OAuth, provider token exchange, Office-file opening in Excel/PowerPoint, Next build, TypeScript JSX parsing, and Capacitor sync/device testing were not verified here. Do not treat source-level OAuth tests as proof of a live provider configuration.


## Current check summary

- Targeted focused suite: 30/30 passed.
- Full `node --test tests/*.test.mjs`: 238 passed, 25 failed in this checkout. A large portion of failures are module-load failures because Express, Firebase Admin, @hapi/iron, TypeScript and other package dependencies could not be installed; the remaining failures include pre-existing stale source checks and model-catalog test failures.
- All `server/*.js` files and the changed pure JavaScript modules pass `node --check`.
