// Account-scoped pointer to the latest generated artifact. The binary stays in
// IndexedDB (attachments); only its stable metadata is kept in settings.
const KEY = 'agent-latest-artifact';
const MAX_AGE_DAYS = 90;

export async function rememberGeneratedArtifact(db, accountId, artifact) {
  if (!db?.settings || !db?.attachments || !accountId || !artifact?.id) return false;
  const row = await db.attachments.get(artifact.id);
  if (!row?.blob) return false;
  await db.settings.put({
    key: `${KEY}:${String(accountId)}`,
    value: {
      id: String(artifact.id),
      name: String(artifact.name || row.name || 'generated-file').slice(0, 180),
      type: String(artifact.type || row.type || 'application/octet-stream').slice(0, 120),
      size: Number(artifact.size || row.size || row.blob.size || 0),
      createdAt: row.createdAt || new Date().toISOString(),
    },
  });
  return true;
}

export async function getLatestGeneratedArtifact(db, accountId) {
  if (!db?.settings || !db?.attachments || !accountId) return null;
  const saved = await db.settings.get(`${KEY}:${String(accountId)}`);
  const meta = saved?.value;
  if (!meta?.id) return null;
  const age = Date.now() - Date.parse(meta.createdAt || '');
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_DAYS * 86400000) return null;
  const row = await db.attachments.get(meta.id);
  if (!row?.blob) return null;
  return { ...meta, blob: row.blob };
}

export function isDebugOrRepairRequest(value) {
  return /\b(debug|debugging|fix|repair|patch|bug|error|broken|failing|stack trace|regression|crash)\b/i.test(String(value || ''));
}
