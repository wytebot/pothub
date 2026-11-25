# Vercel-only API wiring

- Removed the frontend `VITE_API_URL` backend dependency.
- Routed application API calls to same-origin Vercel serverless functions; Android builds use the production Vercel domain.
- Added a Vercel catch-all API function that reuses the existing API handler for routes not covered by dedicated functions.
- Refactored the standalone Node API entry point into an exportable request handler so it can run inside Vercel Functions.
- Disabled durable-background availability in the client because Vercel Functions do not keep the persistent worker process alive.
- Updated Settings copy and deployment documentation to describe the Vercel-only setup and its worker/runner limitations.
