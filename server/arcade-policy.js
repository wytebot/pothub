/** Server-side limits for arcade credit rewards. Client-reported score and duration are never sufficient on their own. */
export const ARCADE_DAILY_CREDIT_CAP = 20;

export const arcadeDayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/**
 * Pure decision over the per-account per-day counter row.
 * row: { day, refs: string[] } (refs are ledger references already counted today).
 * Returns { action: 'duplicate' | 'deny' | 'grant', next }.
 */
export function decideArcadeClaim(row, reference, now = Date.now(), cap = ARCADE_DAILY_CREDIT_CAP) {
  const day = arcadeDayKey(now);
  const refs = row && row.day === day && Array.isArray(row.refs) ? row.refs.map(String) : [];
  if (refs.includes(String(reference))) return { action: 'duplicate', next: { day, refs } };
  if (refs.length >= cap) return { action: 'deny', next: { day, refs } };
  return { action: 'grant', next: { day, refs: [...refs, String(reference)] } };
}
