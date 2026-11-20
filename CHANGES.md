# PotHub 0.5.10 – faster reading of large files

## What was found
Large text sources (plain text, code, Word, and anything `readyFiles` turns into text: PDFs with a text layer, ZIP/TAR projects, sheets, slides) went through `chunkLargeTextFiles()` in `src/agent/workflow.ts`:

1. **Segments were tiny**: `CHUNK_CHARS = 28_000` (about 7k tokens), although the supported models hold 128k to 1M tokens.
2. **Everything ran one request after another**: a `for` loop awaited each segment, then a second loop awaited each group of 5 summaries, round after round.
3. **The merge step always ran**, even when the findings would have fit in a single request, and groups were a fixed 5 regardless of size.
4. **Source text was sent twice in the quality-check pass**: it was in the prompt as `SOURCE EVIDENCE` and again as `files: chunked.files`.
5. **No retry**: one 429/5xx in the middle of dozens of sequential requests threw the whole job away and restarted on another model.
6. Segments were cut at arbitrary points, so a ZIP project could be split in the middle of a file, and every segment was summarised. For code-change requests, that is the part that loses exact source.

Example (1.5M characters): old = 72 sequential extra requests; new (Gemini) = 8 requests, 2 sequential steps. A source up to 400k characters (Gemini) / 240k (OpenAI, xAI) is now read whole with 0 extra requests.

## What changed
| File | Change |
|---|---|
| `src/agent/chunking.ts` (new) | Dependency-free helpers: per-provider `budgetFor()`, `splitTextIntoChunks(text, size, overlap)` (now prefers cutting at an archive `=== path ===` marker), `groupByBudget()`, `mapLimit()` (ordered, concurrency-capped, fail-fast), `withRetry()`. |
| `src/agent/workflow.ts` | `chunkLargeTextFiles()` rewritten: read whole if it fits; otherwise big segments analysed in parallel; merge only when findings still do not fit, in parallel groups packed by size, single-item groups skipped; temporary 429/5xx retried; the user is told when a file was condensed. A provider "too large" 400 now switches to read-in-parts automatically (`forceSplit`). Quality-check pass no longer re-sends text already in the prompt. `splitTextIntoChunks` is still exported from here. |
| `src/agent/attachments.ts` | Bug fix: `toAttachments(files, _have)` used `have` in its body (`ReferenceError` at runtime, type error under `strict`). Parameter renamed to `have`. |
| `src/agent/chunking.test.ts` | Existing tests kept (explicit 28k/900 sizes); added tests for budgets, marker-aware cuts, termination, ordering/concurrency, fail-fast, grouping, retry. |

Budgets (characters, not tokens): Gemini 400k whole / 200k per part / 4 at a time; OpenAI and xAI 240k / 120k / 3; unknown provider 200k / 100k / 2. They sit below each provider's maximum on purpose, because free keys have per-minute token limits and the answer, history and review need room.

## Verified, and not verified
- Ran: `chunking.test.ts` (15 tests) under Node 22 with a small stand-in for `vitest` and `fflate`: 15 pass, 0 fail. Syntax check of all four files passes. Request counts above come from the real splitter and grouping code; the size of merge summaries (about 12% of a segment) is an assumption.
- Not run: `vitest` itself, `tsc --noEmit` and `vite build` (the upload has no `node_modules` and this sandbox has no network). Run `npm ci && npm run typecheck && npm test` before shipping.
- Not tested against live Gemini/OpenAI/xAI keys, so real latency gains are unmeasured.

## Limits and next steps
- A source bigger than the direct budget is still condensed, so exact wording can be lost. For "fix this project" requests, raise `direct` only if your keys' per-minute token limits allow it.
- The quality-check pass is unchanged (one extra request). If you want it faster, skip it when `prefer === 'speed'`.
- If free-tier Gemini keys return 429 on large reads, lower `gemini.direct` (e.g. 250_000) in `chunking.ts`.
- PDF text extraction (`pdfText`) still reads pages one at a time; not changed.
