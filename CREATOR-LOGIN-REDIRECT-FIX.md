# Creator login redirect fix

The Creator sign-in completion paths now explicitly set the active section to `workspace` as well as switching to the app shell. This applies to Firebase Google redirect completion, Firebase auth-state restoration, and native OAuth deep-link/code exchange. If an existing web session token is already present, the auth-state callback still restores the Creator workspace rather than returning without updating navigation.

Verification: `node --check` passed for `server/app.js` and `server/lib.js`. The available Node test suite ran 100 tests: 84 passed; 16 could not run because this ZIP does not include installed dependencies (`express`, `firebase-admin`, `typescript`). Full frontend production build and live Google OAuth redirect testing remain unverified.
