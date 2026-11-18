// Local display cache only. All generation attempts are enforced atomically by the authenticated server API.
export type Kind = 'image' | 'video';
export const FREE_LIMITS: Record<Kind, number> = { image: 30, video: 10 };
const dayKey = () => `quota.${new Date().toISOString().slice(0, 10)}`;

// Set only after the billing server confirms an active subscription (see billing/api.ts).
export const isPremium = () => Number(localStorage.getItem('billing.entitledUntil') ?? 0) > Date.now();

export function usage(): Record<Kind, number> {
  for (const k of Object.keys(localStorage)) if (k.startsWith('quota.') && k !== dayKey()) localStorage.removeItem(k);
  try { return { image: 0, video: 0, ...JSON.parse(localStorage.getItem(dayKey()) ?? '{}') }; } catch { return { image: 0, video: 0 }; }
}
export const remaining = (k: Kind) => (isPremium() ? Infinity : Math.max(0, FREE_LIMITS[k] - usage()[k]));
export const resetsAt = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d; };
