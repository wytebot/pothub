# pothub code-work added: "fix it", "debug the code", "wire it", "build the app" now start the work and return a zip

## What was found
- "fix it", "debug it" and similar only reached a text model by luck of wording. "wire it", "make it work", "get it working", "finish it" or "hook it up", sent with nothing attached, fell through `interpret()` to its last line and were treated as a PICTURE request.
- Even when they reached the text model, the answer came back as chat, because only "zip it"-style wording produced a zip.
- Follow-ups such as "fix it" had no way to know there was code in the conversation.

## What changed
| File | Change |
|---|---|
| `src/agent/codeWork.ts` (new) | `detectCodeWork(prompt, ctx)` recognises five kinds of request (fix, debug, wire, build, improve) and `codeContext(history, files)` says what there is to work on. |
| `src/models/router.ts` | `interpret()` accepts `code`; a code request always goes to the text model. |
| `src/agent/deliver.ts` | `wantedOutput(prompt, code?)` returns a ZIP for code work (unless another format such as PDF is named). The system prompt gets a code-task block: analyse the architecture first, find root causes, deliver every changed or new file complete, include `FIXES.md` (issue, root cause, files changed, checks run and not run, next steps), ask no questions. A different block applies for fix, debug, wire, build and improve. |
| `src/agent/workflow.ts`, `src/pages/Home.tsx` | Pass the conversation and attachments so short messages are understood. Image-only attachments do not count as code, so "fix it" with a photo still edits the photo. |
| `src/agent/fileNames.ts` | Zip names for the new cases: "pothub wired version", "pothub source code". |

## Phrases recognised
- Fix: fix it / this / that / them / everything / the code / all the bugs, repair, patch, resolve, solve, sort it out, "make it work", "get it working / running", "it's not working", "it doesn't work", "this is broken", "the app crashes on login", "send me the fixed code", "give me the corrected files", "apply the fixes".
- Debug: debug it / the code / this, troubleshoot, diagnose the issue, find (and fix) the bugs.
- Wire: wire it (up), wire the app / everything, hook it up, connect everything, connect the frontend to the backend, integrate it.
- Build: build the app / it / this / the project / everything / the whole thing, make or create or develop the app, code it, implement it, finish it, complete the project, continue building, start building / coding, "build me a todo app", "create a website for my bakery".
- Improve: improve / refactor / optimize / clean up / upgrade / update the code, "make it production ready", "make it better".
- Polite wrapping is ignored: "please", "pls", "can you", "just", "go ahead and", "for me", "now"; the request can be one sentence of several.
- "yes", "do it", "go ahead", "proceed" count only when the last reply offered to make the changes.

## What it does not take for code work
Questions and explanations ("how do I fix a flat tire?", "explain the code"), non-code subjects (grammar, essays, resumes, sleep, a leaky tap), media ("create an app icon", "build a pot icon") and "build muscle / a habit / a brand".

## When context is required
"fix it", "debug it", "wire it", "improve the code" need something to work on: attached files, code or an error in the recent chat, or code or an error pasted in the message. Otherwise they stay normal chat. "Build the app" and "build me a todo app" need nothing.

## Verified, and not verified
- Ran under Node 22 with stand-ins for `vitest` and `fflate`: 13 new tests (all phrases above, the negatives, context rules, zip format, system prompt, router, zip names) and the 12 naming tests all pass. The real `deliver.ts`, `router.ts` and `fileNames.ts` were used.
- Not run: `agent.test.ts` (it imports modules that need `node_modules`), `tsc`, `vite build`, the real `vitest`. Calls without the new argument behave exactly as before, so the existing `wantedOutput` and `interpret` tests should be unaffected, but run `npm ci && npm run typecheck && npm test` to confirm.
- Not tried against live models, so how complete the zips are depends on the model.

## Limits
- Rule-based: unusual wording ("make this thing behave") is not recognised; add it in `codeWork.ts`.
- Attachments from earlier messages are not kept, only the chat text, so "fix it" in a later message works from what the reply contained.
- Raw file markers still appear in the chat text of a zip answer, as before.
