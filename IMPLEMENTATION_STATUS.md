# Implementation status

## Firebase migration source status (2026-10-28)
- Server persistence now routes through Firebase Admin + Cloud Firestore; the Supabase SDK was removed from runtime dependencies.
- Profiles, credit orders, credit ledger, repair tasks, Vercel connections/OAuth state, monitored projects, notifications and push subscriptions use Firestore collections.
- Credit spend and grant use Firestore transactions; grants are idempotent by positive ledger reference.
- Firestore client rules deny all direct client access. Composite indexes are included.
- A guarded one-time Supabase REST export → Firestore import utility is included. It refuses to import if any target collection is non-empty.

## Not yet verified in a live environment
- The migration utility has not been run against the user's real Supabase/Firebase projects because no project credentials were supplied.
- Existing production data must be imported and balances/orders reconciled before cutover. Do not remove old Supabase data until this is verified.
- Vercel production deployment, real Firebase connectivity, OAuth, Flutterwave sandbox/production, Android APK and browser end-to-end tests remain unverified.
- Creator Google sign-in is not yet integrated end-to-end with server-side API authorization; current developer API session still requires GitHub.
- Video generation remains unsupported; image adapter and text connectivity need live-provider testing.
