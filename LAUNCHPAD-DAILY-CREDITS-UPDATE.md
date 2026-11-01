# Launchpad and daily free credits update

- Added a dedicated Launchpad section, reachable from the collapsible profile menu and navigation.
- Developer Launchpad prepares a Repo Rescue handoff by selecting a connected repository and transferring pasted logs to the existing diagnosis workflow. It does not claim to run a scan before the user proceeds.
- Creator Launchpad prepares a 10-image campaign batch and opens the existing Creator workspace with batch size set to 10.
- Added a Prove-It entry card that directs users to the existing review/verification workflow.
- `getCredits()` now grants 5 free credits once per UTC day using an idempotent per-account daily grant reference. The grant is additive, so credit pack purchases do not disable or replace the daily grant. Existing starter-credit abuse controls remain in place for the separate initial starter grant.
- Daily credits are materialized on the next authenticated balance check or credit-using workflow; this is not a midnight push notification. Unused daily grants currently accumulate in the same total balance, while the grant itself is limited to once per UTC day.

## Verification

- `node --check server/lib.js` passed.
- `node --check server/app.js` passed.
- Static release audit passed.
- 89 tests passed. 16 tests could not run successfully because dependencies such as `express`, `firebase-admin`, and `typescript` are not installed in this working directory; this environment therefore did not verify a production build or live Firestore behavior.
