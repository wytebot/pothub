# Fix Vercel OAuth “App redirect URL is invalid”

PotHub cannot change the redirect allowlist inside Vercel’s OAuth application. The OAuth app configuration and PotHub’s callback URL must match exactly.

1. In the Vercel developer/integration configuration for the OAuth app whose `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET` are configured in PotHub, set the redirect/callback URL to:
   `https://pothub-self.vercel.app/api/vercel/callback`
2. In PotHub’s Vercel project, set `VERCEL_REDIRECT_URI` to that same exact value (no trailing slash, query, fragment, or preview hostname).
3. Confirm `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET` belong to that same Vercel OAuth app.
4. Redeploy PotHub after changing environment variables, then retry Connect Vercel from the production URL.

If your actual production domain differs, use that domain in both places. Do not use the PotHub frontend URL alone: the callback path must be `/api/vercel/callback`. Preview deployments should not initiate production OAuth because their host will not match the registered callback.
