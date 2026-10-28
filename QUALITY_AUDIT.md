# Quality audit — current source status

## Implemented in source
- Firebase Admin + Firestore adapter replaces the Supabase SDK for server-side persistence.
- Firestore transaction paths handle profile initialization, credit spending and idempotent grants.
- Firestore rules deny direct client access; indexes and one-time migration utility are included.
- API fails closed if Firebase Admin/Firestore is not configured.
- Existing unit tests and source audit pass; pricing estimate check passes.

## Open items
1. Run the guarded one-time migration against the actual old Supabase and destination Firebase projects; reconcile user balances, paid/pending orders, ledger references and encrypted Vercel tokens before production cutover.
2. Install dependencies and run a real Vite production build; the prior dependency install timed out.
3. Test Firestore adapter queries and transactions against a Firebase Emulator or disposable project, including duplicate webhooks and concurrent credit spends.
4. Complete end-to-end Creator Google auth and server-side Firebase ID-token authorization.
5. Verify Flutterwave v4 in sandbox, Android native Downloads/share behavior, OAuth and full browser/APK workflows.
6. Video generation is not implemented. Image generation requires a real image-capable Gemini model/key test.

The source audit is not proof of production deployment or live integration readiness.
