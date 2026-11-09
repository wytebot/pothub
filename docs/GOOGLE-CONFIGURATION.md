# Google configuration for PotHub

PotHub's current Creator sign-in and Android Google OAuth handoff use the server-side
OAuth settings (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET`) and
the existing Firebase web configuration in `src/lib/firebase.js`.

Do not add an OAuth client secret, Firebase service-account key, or other private
credential as `google.json` at the repository root. Those values belong in deployment
secret storage (for example, Vercel Environment Variables), never in Git.

If a future Android build explicitly enables the Firebase Android SDK's
`google-services` Gradle plugin, the Firebase Console downloads a file named
`google-services.json`; its conventional location is `android/app/google-services.json`,
not `google.json` at the repository root. It identifies the Firebase app but is not a
replacement for server OAuth secrets. Keep it out of source control unless the team
has deliberately reviewed the exposure and repository policy.
