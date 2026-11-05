# PotHub v0.1.14 — Vercel callback and custom endpoint hardening

- Merged on top of the supplied full project and v0.1.13 affected-file update.
- Custom HTTPS agent endpoints are enabled by default; set `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=false` to disable. Existing URL/IP/SSRF checks remain active.
- Vercel callback resolution now prefers the explicit callback, canonical API origin, stable Vercel production project domain, then legacy app URL/request host.
- Added a no-store callback diagnostic endpoint and a copyable exact callback URL in the Vercel Backend page.
- Updated setup documentation to distinguish Sign in with Vercel identity scopes from Integration environment-variable permissions.
- Documented that environment variables do not inject backend route source code into an arbitrary project.
- No claim of a live Vercel OAuth success: the exact callback still must be registered in the Vercel app dashboard, and environment writes require the correct API permissions.
