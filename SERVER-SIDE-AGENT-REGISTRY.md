# Server-side agent registry wiring — 2026-11-03

## Implemented in this patch

- AI text, diagnosis, repair, image, and agent-test requests can send saved agent IDs instead of API keys.
- The server resolves those IDs only inside the authenticated user's Firestore workspace, checks the requested workspace and task against saved agent metadata, decrypts the saved API key server-side, and binds model variants to that same key/provider/endpoint.
- Workspace sync no longer returns `secretEncrypted`, `secretPlain`, or `secret` fields to clients. It returns `keyConfigured` metadata only.
- Metadata-only syncs preserve an existing encrypted server-side key. Devices that already have a local encrypted key retain that local copy; a new device can invoke saved agents through the server registry without downloading the secret.
- Agent tests now use saved agent IDs and run provider checks server-side.
- The API & Agents edit form tolerates an agent record that has no local secret; the user can enter a replacement key.

## Cost

This uses the existing PotHub server and Firestore. It adds a small Firestore lookup per agent resolution and server-side decryption/metadata validation. It does not add an AI provider or make PotHub pay for the user's AI tokens. Actual marginal cost depends on request volume, Firestore billing, Vercel usage and cache behavior; measure invoices before claiming zero cost.

## Important limits / migration window

This is a staged migration, not a claim that every API key is now absent from every client path. Legacy requests that submit `agentConfig.keys` remain temporarily accepted for compatibility. Video generation/polling in the current Creator UI still uses the existing client-side video adapter and local key. These paths must be migrated before claiming complete server-only key custody. Existing local encrypted agent records are intentionally preserved so this change does not destroy access for current users.

## Required environment

- Firebase Admin / Firestore must be configured and available for server-side agent resolution.
- `POTHUB_VAULT_ENCRYPTION_KEY` must be a stable, randomly generated 32-byte key encoded as 64 hexadecimal characters (generate with `openssl rand -hex 32`). Back it up securely before deployment; changing it without a key migration makes stored agent credentials unreadable.
- Legacy platform AI provider keys are ignored for inference; remove them from deployment settings when convenient.

## Manual checks

1. Save and sync a Chat agent while online.
2. Inspect `/api/workspace/sync` response: agent data must contain `keyConfigured`, but never a secret, encrypted blob or plaintext key.
3. Send a Creator chat request and confirm its payload contains `agentConfig.agentIds`, not `agentConfig.keys`.
4. Repeat for Developer chat, diagnosis, repair and image generation.
5. Try an agent ID from the other workspace and verify the server refuses to resolve it.
6. Test an agent and confirm provider errors are sanitized and no key appears in logs or response JSON.
7. Test a second device: agent execution should work through the registry; editing requires entering a replacement key if no local key exists.
8. Do not claim full server-only custody until the legacy request path and client-side video path are removed.


## Firestore read control

The server batches cache misses with Firestore `getAll` and caches only encrypted agent rows (never plaintext API keys) in a bounded process-local cache for 15 seconds, capped at 500 entries. Sync saves/deletes invalidate the relevant cached agent immediately in that process. This reduces repeated billed reads on warm instances; serverless instances do not share cache, and `getAll` reduces network round trips but does not reduce Firestore's per-document read billing.
