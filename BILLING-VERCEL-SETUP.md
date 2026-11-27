# Pothub Pro billing (Vercel)

The billing routes are deployed as Vercel serverless functions at `/api/billing/status`, `/api/billing/checkout`, `/api/billing/verify`, and `/api/billing/webhook`. The browser/mobile app does not receive Flutterwave or Firebase Admin secrets.


## Required server-side Vercel environment variables

- `FLW_SECRET_KEY` — Flutterwave Secret Key (`FLWSECK_TEST-...` for test mode or live secret key for production).
- `FLW_WEBHOOK_HASH` — the Flutterwave webhook verification hash configured in Flutterwave dashboard.
- `FIREBASE_SERVICE_ACCOUNT` — Firebase Admin service-account JSON as a single-line JSON environment value (or base64-encoded JSON). Never use a `VITE_` prefix.
- `APP_ORIGIN` — canonical HTTPS Pothub origin, e.g. `https://pothub-self.vercel.app`.
- `VITE_FIREBASE_PROJECT_ID` or `FIREBASE_PROJECT_ID` — Firebase project ID (usually already configured for the client).
- `PREMIUM_MONTHLY_AMOUNT` — optional, defaults to `7.99`.
- `PREMIUM_YEARLY_AMOUNT` — optional, defaults to `70`.
- `PREMIUM_CURRENCY` — optional, defaults to `USD`.

`FLW_CLIENT_ID` is not used by this implementation: hosted Flutterwave v3 checkout is initiated server-side with `FLW_SECRET_KEY`. Keep it in Vercel if another integration needs it, but it cannot substitute for the Secret Key.


## Flutterwave webhook

Set the webhook URL to `https://pothub-self.vercel.app/api/billing/webhook` and configure its verification hash to match `FLW_WEBHOOK_HASH`. Webhook payloads are only triggers; Pothub independently calls Flutterwave's transaction verification API before activating Premium.


## Deploy checklist

1. Add the environment values above to the Vercel project for all deployment environments that should offer payments.
2. Redeploy after changing environment variables.
3. In Flutterwave, use matching test/live keys and currency.
4. Sign in with a verified Google account and open Premium. The Upgrade button should enable only when the server reports configured billing.
5. Complete a test payment and confirm the server verifies it and Premium activates; do not rely on redirect status alone.
