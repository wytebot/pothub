# AI credit batch policy update

- Each successful AI agent action consumes one credit. Generated images and files consume one credit per output; delivered videos consume one credit each.
- The next two successful workflows are covered by that credit.
- The next batch starts at successful workflow counts 3, 6, 9, and so on, and reserves another credit on its first job.
- Reservation happens before the model/provider job starts. It is committed only after the workflow succeeds; failure releases the reservation and does not increment the successful-workflow meter.
- The same shared meter applies to text, image, and delivered video workflows. Live model discovery/configuration does not consume a credit.

## Verification
- `node --check server/lib.js`: passed.
- `node --check server/app.js`: passed.
- `node --test tests/ai-workflow-credit-policy.test.mjs`: 3 passed.
- Full `npm test`: 164 passed, 24 could not run successfully because dependencies including `express`, `firebase-admin`, and `typescript` are not installed in this working directory. This is an environment/dependency blocker, not a passing full-suite result.
