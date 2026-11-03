# PotHub vault encryption key setup

## Generate your key

Generate a fresh 32-byte random key on your own computer or in a trusted terminal:

```sh
openssl rand -hex 32
```

The output must be exactly 64 hexadecimal characters. Do not paste the generated value into chat, GitHub, source code, screenshots, or a `NEXT_PUBLIC_*` variable. If OpenSSL is not installed, use Node.js locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Add it to Vercel

1. Open the PotHub project in Vercel.
2. Go to **Settings → Environment Variables**.
3. Add `POTHUB_VAULT_ENCRYPTION_KEY` and paste the generated value into the secret value field.
4. Select Production, Preview, and Development if you use the vault in all three environments. For Preview, a separate key is acceptable only if preview data is separate from production data.
5. Save and redeploy. Vercel applies environment-variable changes to new deployments, not deployments already built.

Official Vercel guide: https://vercel.com/docs/environment-variables/managing-environment-variables

## Critical precautions

- Back up the key in a trusted password manager or secrets manager. PotHub cannot recover it if lost.
- Keep it stable across deployments. Rotating it requires a migration that decrypts and re-encrypts existing vault records.
- Do not reuse `SESSION_SECRET`; the vault requires its own key.
- Never log the key or return it from an API route.
- Existing encrypted records created using the older `SESSION_SECRET` fallback will not decrypt after this dedicated-key change unless migrated first. **Before switching an existing live deployment, migrate the existing encrypted records to the new key or keep the old key available for a controlled migration.** Do not simply change the key on production and assume old credentials will continue working.

## Firestore read behavior

Agent lookup batches cache misses using Firestore `getAll` and uses a bounded 15-second process-local cache of encrypted agent records. Cache entries are invalidated on sync writes/deletes in that running instance. This reduces repeat reads on warm serverless instances; it does not eliminate per-document read billing and cache is not shared between instances.
