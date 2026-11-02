# Workspace and toolbar credit rules

- Developer workspace APIs require a GitHub-authenticated Developer session; Creator-only Google sessions must not use Developer repository mutations.
- Creator APIs require a Google Creator session and must not expose GitHub repository/code data.
- Provider model discovery (`/api/agent/models`) is free. It may inspect the user's configured provider key to discover active models.
- All other model inference must use user-configured agent candidates. PotHub must not silently fall back to a platform-funded model/key.
- Browsing and opening GitHub repositories is free.
- Successful repository deletion, pull-request creation, and repair-branch revert cost one credit each. These endpoints reserve one credit, commit on successful response, and release on failure. Clients should send a stable `Idempotency-Key` to make retries safe.
- Repository deletion requires typing the exact repository name in `confirmName`.

These rules describe intended server enforcement; live OAuth/GitHub/Firestore behavior still requires integration testing with configured credentials.
