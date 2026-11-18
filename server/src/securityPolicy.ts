export type UsageKind = 'image' | 'video';
export const FREE_LIMITS: Record<UsageKind, number> = { image: 30, video: 10 };
export function validUsageRequest(kind: unknown, amount: unknown): kind is UsageKind {
  return (kind === 'image' || kind === 'video') && typeof amount === 'number' && Number.isInteger(amount) && amount >= 1 && amount <= (kind === 'image' ? 4 : 1);
}
export function roleFor(uid: string, adminUids: ReadonlySet<string>): 'admin' | 'user' {
  return adminUids.has(uid) ? 'admin' : 'user';
}
