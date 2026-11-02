# PotHub credit rules update

- Five free Express credits are granted on a rolling 24-hour window per account, not at UTC midnight. A persisted pending grant reference makes retries idempotent if a process stops between claiming the window and granting credits.
- Text AI workflows, Creator image batches, and delivered Creator video workflows share one server-side per-account meter. One credit is charged for each group of three successfully completed AI workflows, regardless of plan, workspace, or BYOK/platform AI mode. Failed workflows do not increment the completed count; the credit reservation is committed only after the successful result is validated/delivered. Concurrent AI workflows for the same account are serialized by a short-lived Firestore lease to avoid double counting.
- In Codelab, successful pull-request creation, repository deletion, and repository revert each cost one credit. Failed operations release their reservation. Deterministic payload-based idempotency keys are used when clients omit an operation ID, reducing duplicate charges on retries.
- Model discovery and agent configuration remain free. Provider inference costs for user-owned API keys are still billed by the provider, not PotHub.

## Verification caveats

The source and targeted tests should be run before deployment. This report does not claim a successful live Vercel deployment or a production build in this environment.
