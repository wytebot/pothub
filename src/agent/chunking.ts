// Large-source handling, kept free of imports so it is cheap to test and safe to reuse.
//
// Strategy (fastest first):
//   1. READ WHOLE   - a source that fits the provider's context goes in as one piece: no extra requests at all.
//   2. MAP IN PARALLEL - only a source that does not fit is split into big, file-boundary-aware segments,
//                        and the segments are analysed several at a time (order is preserved).
//   3. MERGE ONLY IF NEEDED - segment findings are concatenated; they are condensed further only when they
//                        still would not fit, and then in parallel groups packed by size, not by a fixed count.

export interface Budget {
  /** Characters of source text that may be sent to the model in a single request (all files together). */
  direct: number;
  /** Characters per segment when a source has to be split. */
  chunk: number;
  /** Characters repeated at each segment boundary so nothing is lost between segments. */
  overlap: number;
  /** Segments analysed at the same time. */
  parallel: number;
}

// Characters, not tokens: code and prose average roughly 3 to 4 characters per token, so these stay well
// inside the 128k-token context that the smallest supported chat models have, and far inside Gemini's 1M.
// They are deliberately below the provider maximum: free keys have per-minute token limits, and the answer,
// the conversation and the review pass need room too.
const BUDGETS: Record<string, Budget> = {
  gemini: { direct: 400_000, chunk: 200_000, overlap: 2_000, parallel: 4 },
  openai: { direct: 240_000, chunk: 120_000, overlap: 2_000, parallel: 3 },
  xai: { direct: 240_000, chunk: 120_000, overlap: 2_000, parallel: 3 },
};
const FALLBACK: Budget = { direct: 200_000, chunk: 100_000, overlap: 2_000, parallel: 2 };

export const budgetFor = (provider: string): Budget => BUDGETS[provider] ?? FALLBACK;

/**
 * Splits text into ordered, overlapping segments no longer than `size`. Prefers to cut where an archive's
 * "=== path ===" file marker starts (so a file stays whole), then at a line, sentence or word boundary.
 * Every character of the source appears in at least one segment.
 */
export function splitTextIntoChunks(text: string, size = FALLBACK.chunk, overlap = FALLBACK.overlap): string[] {
  if (text.length <= size) return [text];
  const ov = Math.max(0, Math.min(overlap, Math.floor(size / 4)));
  const chunks: string[] = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const floor = start + size * 0.65;
      const marker = text.lastIndexOf('\n=== ', end);
      const boundary = marker > floor ? marker : Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end - 500));
      if (boundary > floor) end = boundary + 1;
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(start + 1, end - ov);
  }
  return chunks;
}

/** Packs consecutive items into groups of at most `budget` characters (an oversized item gets its own group). Order is kept. */
export function groupByBudget(items: string[], budget: number): string[][] {
  const groups: string[][] = []; let cur: string[] = []; let len = 0;
  for (const it of items) {
    if (cur.length && len + it.length > budget) { groups.push(cur); cur = []; len = 0; }
    cur.push(it); len += it.length;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * Like Promise.all(items.map(fn)) but with at most `limit` running at once. Results keep the input order.
 * After the first failure nothing new is started; work already running is allowed to finish, then the error is thrown.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length); let next = 0; let failed = false; let error: unknown;
  const worker = async () => {
    while (!failed) {
      const i = next++; if (i >= items.length) return;
      try { out[i] = await fn(items[i], i); } catch (e) { if (!failed) { failed = true; error = e; } return; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failed) throw error;
  return out;
}

/** Runs `fn`, retrying a few times (with a growing pause) while `retryable(error)` says the failure is temporary. */
export async function withRetry<T>(fn: () => Promise<T>, retryable: (e: unknown) => boolean, opts: { tries?: number; pauseMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const tries = opts.tries ?? 3; const pause = opts.pauseMs ?? 1500; const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let n = 1; ; n++) {
    try { return await fn(); } catch (e) { if (n >= tries || !retryable(e)) throw e; await sleep(pause * n); }
  }
}
