# Implementation status

## Firebase migration source status (2026-10-28)
- Server persistence uses Firebase Admin + Cloud Firestore.
- Profiles, credit orders, credit ledger, repair tasks, Vercel connections/OAuth state, monitored projects, notifications and push subscriptions use Firestore collections.
- Credit spend and grant use Firestore transactions; grants are idempotent by positive ledger reference.
- Firestore client rules deny all direct client access. Composite indexes are included.
- The deployed application does not require a legacy database migration utility.

## Not yet verified in a live environment

- Verify that required user, credit, billing and integration records exist in Firestore before production use.
- Vercel production deployment, real Firebase connectivity, OAuth, Flutterwave sandbox/production, Android APK and browser end-to-end tests remain unverified.
- Creator Google sign-in is not yet integrated end-to-end with server-side API authorization; current developer API session still requires GitHub.
- Video generation remains unsupported; image adapter and text connectivity need live-provider testing.
