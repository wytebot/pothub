# Pothub billing deployment guide

## Current integration scope

This package implements a server-authoritative Premium entitlement with Flutterwave hosted checkout (Flutterwave v3 hosted payments endpoint). Flutterwave hosted checkout handles card/bank verification challenges such as OTP, PIN prompts, and 3-D Secure on the provider/bank flow; Pothub never collects card PINs or OTPs. This is not yet the v4 API integration. Flutterwave v4 orchestration uses customer/payment-method setup and its OAuth access token flow, and should not be guessed or enabled until tested with the merchant account.

## Server-only environment

Set these values on the server deployment (never in VITE_ variables or the client build):

- `FLW_SECRET_KEY`: Flutterwave test key initially; rotate before go-live if exposed.
- `FLW_WEBHOOK_HASH`: strong random value configured as Flutterwave webhook secret hash.
- `APP_ORIGIN`: exact canonical app origin, no trailing slash.
- `PREMIUM_AMOUNT_NGN`: integer or numeric amount (default 2500).
- `PREMIUM_CURRENCY`: currently NGN by default; must match your Flutterwave merchant account.
- `PREMIUM_DAYS`: access duration (default 30 days).
- Firebase Admin credentials via `FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS`.


## Flutterwave dashboard

1. Use test mode and complete simulated payments first.
2. Set webhook URL to `<API_ORIGIN>/api/billing/webhook`.
3. Set the webhook secret hash to the same `FLW_WEBHOOK_HASH` value.
4. Enable the payment completion event (`charge.completed`).
5. Test pending, failed, cancelled, duplicate webhook, successful payment, and mismatched amount/currency.
6. Complete Flutterwave KYC and use live keys only after test cases and the deployment review pass.


## Firebase

- Admin SDK must have access to Firebase Authentication and Firestore.
- Firestore client rules remain deny-all; billing records are server-only.
- Optional: configure Firestore TTL on `billingTransactions.expiresAt` for pending checkout cleanup. Verified transactions should not be removed by the pending-record TTL. If using TTL, add a separate pending-expiry field or use a scheduled cleanup that deletes only records where status is still `pending`.
- Firebase custom claim `pothubProUntil` is a Unix timestamp in seconds. The site limit code checks expiration locally. Clients should refresh ID tokens after entitlement activation.

## Deployment checks (mandatory before production)

- Ensure `APP_ORIGIN` is the HTTPS production origin and CORS is configured for it.
- Test server rate limits and webhook signature rejection.
- Check Firestore billingTransactions for only UID, amount/currency, transaction reference/id, status and timestamps; never store card data or OTP/PIN.
- Run `npm ci` at repository root and in `server/` where lockfiles exist; run root `npm run typecheck`, `npm test`, `npm run build`, and server `npm run typecheck`, `npm test`.
- Test the hosted checkout callback in desktop browser and Capacitor Android. Confirm an ID token refresh is required for custom claims.
- Validate entitlement duration, renewals (each successful payment extends from the current expiration), and expired entitlements.
- Configure backups, monitoring, webhook retries and a payment reconciliation process.
- Do not claim production-ready until all tests above pass with a real Flutterwave test merchant account and Firebase deployment.


## OTP / PIN

Flutterwave-hosted checkout delegates cardholder PIN, bank OTP and 3DS challenges to Flutterwave and the issuing bank. Pothub does not request or store card PINs or OTPs. Any Flutterwave PIN challenge shown by the checkout page is controlled by the payment provider.
