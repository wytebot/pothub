# Intent routing and delivery update

## Files changed
- `src/lib/intent-lexicon.js` — new data tables for 18 languages and shared output format list.
- `src/lib/request-intent.js` — NFKC normalization, direction-mark cleanup, multilingual matching, code/how-to guard precedence, attached-image-to-video priority, and language hint metadata.
- `src/lib/output-files.js` — MIME entries and builders for XML, YAML, labelled source fences, and ZIP exports with README manifest, duplicate names, filename/path cleanup, 2 MiB per-file and 10 MiB total caps. CSV formula neutralization remains intact.
- `src/ui/App.jsx` — forwards a detected language hint to chat requests.
- `server/app.js` — accepts `replyLanguage`, adds the reply-language instruction, and expands the output-format enum.
- `tests/multilingual-intent.test.mjs` — table-driven 8-positive/8-negative examples per language and mixed-language guard cases.
- `tests/intent-routing-and-delivery.test.mjs` — replaced the exact stale output-format enum regex with a behavior-oriented format presence assertion.
- `CHANGELOG-INTENT-ROUTING-DELIVERY.md` — this delivery/verification note.

## Verification performed
- `node --check server/app.js` — passed.
- `node --check src/lib/request-intent.js` — passed.
- `node --check src/lib/output-files.js` — passed.
- Targeted tests: `tests/request-intent.test.mjs`, `tests/multilingual-intent.test.mjs`, and `tests/intent-routing-and-delivery.test.mjs` passed after the final multilingual guard fix.
- Full `node --test tests/*.test.mjs`: **230 passed, 28 failed**. The remaining failures include existing unrelated API/auth/route/model-catalog/security tests; inspect `/tmp/fulltest2.log` from the working session for the complete failure output.

## Explicit limitations — not release verified
- XLSX and PPTX are intentionally refused rather than fabricated; no real OOXML writer was added.
- The requested 300+ golden set and precision/recall report were not completed. No media-routing false-positive percentage is claimed.
- Image-to-image provider audit, image-edit UI/routing, image resize/compress/EXIF handling, mocked edit-provider tests, and source-image preservation were not implemented in this pass.
- The response-style catalog, one-time corrective retry, routing transparency/failure actions, multi-step orchestration, request-ID intent debug logging, and full stale-test replacement set were not completed.
- Not run: Next production build, JSX/TypeScript parse, Capacitor sync, python-docx/openpyxl/python-pptx interoperability checks, native/browser/PWA download verification, and a measured <5 ms classification benchmark.
- No provider keys or secrets were added. Existing BYOK isolation and credit/idempotency code paths were not intentionally altered, but full regression verification is incomplete due to the failing suite.
