# PotHub credit policy

- Every successfully completed AI agent action consumes **1 credit**.
- Each image generated consumes **1 credit**; a batch of 5 images consumes 5 credits.
- Each successfully delivered video consumes **1 credit**. Failed/cancelled video jobs that are not delivered do not consume credits.
- Each generated file consumes **1 credit**. Multi-file generation must be metered by output file count.
- Failed AI actions release their credit reservation and do not consume credits. Retried requests with the same idempotency key must not double-charge.
- Developer GitHub actions already metered separately (such as successful PR creation, repository deletion, or revert) remain 1 credit each.
- Credit packs now start at 60 credits and scale to 150, 300, and 600 credits. Prices remain unchanged and should be reviewed against real provider costs before launch.
- Users' own provider API usage may be billed separately by the AI provider.
