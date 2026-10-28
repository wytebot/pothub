# Firebase / Firestore setup

Pothub now uses Firebase Admin + Cloud Firestore for server-side persistent data. The browser SDK in `src/lib/firebase.js` initializes the public Firebase app configuration, but trusted account, billing, credit-ledger, notification and encrypted Vercel-token operations run through the Express API using Firebase Admin.

## Vercel variables
- `FIREBASE_SERVICE_ACCOUNT_JSON`: complete service-account JSON as a single server-only environment variable.
- `FIREBASE_PROJECT_ID`: optional when project ID is present in the service-account JSON; otherwise set it to the Firebase project ID.

Do not put the service-account JSON in any `VITE_` variable or frontend file. The Firebase web API key is public client configuration, not an Admin credential.

## Firestore
1. Enable Cloud Firestore in Native mode in the Firebase project.
2. Deploy `firestore.rules` and `firestore.indexes.json` using Firebase CLI.
3. Confirm server health reports the database integration ready.
4. Test account creation, credit reservation/refund, repeated payment verification, notification delivery and Vercel token storage in a non-production project.

Client rules deny all direct reads/writes; server routes use Firebase Admin. Do not loosen the rules for convenience.

## Existing Supabase production data
The code switch does not automatically transfer live records. Use `npm run migrate:firestore -- --dry-run` locally with temporary `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON`; review record counts, then run without `--dry-run` only when the target collections are empty. Verify balances, credit ledger references, pending/paid orders and encrypted Vercel credentials before cutting over. Keep the source project until verification is complete. The old Supabase variables are not required by the deployed runtime after migration.
