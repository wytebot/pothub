export const DAILY_FREE_CREDITS = 5;
export const DAILY_FREE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const AI_WORKFLOWS_PER_CREDIT = 3;

/** `completedWorkflows` is incremented only after a validated/delivered success. */
export function shouldChargeForAiWorkflow(completedWorkflows = 0) {
  const raw = Number(completedWorkflows);
  if (!Number.isFinite(raw) || raw < 0) return false;
  const completed = Math.floor(raw);
  return completed % AI_WORKFLOWS_PER_CREDIT === 0;
}

export function nextDailyFreeGrantAt(lastGrantedAt = 0) {
  const last = Math.max(0, Number(lastGrantedAt) || 0);
  return last ? last + DAILY_FREE_INTERVAL_MS : 0;
}

export function isDailyFreeGrantDue(lastGrantedAt = 0, now = Date.now()) {
  const next = nextDailyFreeGrantAt(lastGrantedAt);
  return !next || Number(now) >= next;
}
