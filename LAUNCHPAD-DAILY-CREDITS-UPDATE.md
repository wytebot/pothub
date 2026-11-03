# Launchpad and daily free credits update

- Five free Express credits are granted on a rolling 24-hour window per account, not at UTC midnight. The grant is additive, so purchased credits and daily grants coexist.
- A persisted pending reference makes a daily grant retry-safe if the process stops between claiming the 24-hour window and crediting the account.
- Text AI, image-batch, and delivered-video workflows share a server-side counter. Each group of three successfully completed workflows consumes one PotHub credit across all plans and both workspaces. Failed workflows do not increment the counter.
- Model discovery/configuration remain free. Codelab PR creation, repository deletion and repository revert each cost one credit after successful completion.
