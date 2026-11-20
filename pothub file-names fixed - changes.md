# pothub file-names fixed: every file Pothub produces is named for what it contains

## What was found
- Zip bundles were named from the first 60 characters of the request, then cut to 40: "please-fix-this-project-and-give-me-the-zi". The model's own heading was never used.
- Single files (PDF, Word, Excel, code...) took the reply's first heading, which is often "Completion report" or "Summary", else the start of the request.
- Tools that run on the device named results `files-2026-11-20.zip`, `merged-2026-11-20.pdf`, `photos-<date>.pdf`, `converted-<date>.zip`.
- A saved code block was always `snippet.<ext>`; "Save as file" on an answer used a lower-case slug of its first line.

## What changed
| File | Change |
|---|---|
| `src/agent/fileNames.ts` (new) | One naming module, no imports. App or project name from the attached archive ("pothub-main-fixed__2_.zip" gives "pothub"), else a name in the request ("called Zento", WyBuild), else what is being built ("todo app"); plus what was done ("fixed version", "auth-ui fixed", "dark-mode added", "source code"). Documents use their real heading (generic ones such as Summary are skipped), else the request with "please write me ... as a PDF" removed. Names keep spaces and capitals; characters no system allows and reserved names are handled. |
| `src/agent/bundle.ts` | `buildBundle(reply, name, extra)` takes the content name: it names the zip and, in kebab form, the folder inside. A single-document zip holds `<name>.md`, not `answer.md`. |
| `src/agent/deliver.ts` | `buildFile` uses `fileName()` and receives the attached files, so a changed file keeps its own name ("App fixed version.tsx"). Old `safe`/`titleOf` helpers removed. |
| `src/agent/workflow.ts` | Passes the content name and the attached files. |
| `src/agent/local.ts` | Device-side zip, merge, photos-to-PDF, convert and text-to-file results are named by what they hold ("Invoice merged.pdf", "IMG_2031 and 2 more photos.pdf"); date stamps removed. |
| `src/pages/Home.tsx`, `src/ui/Markdown.tsx` | "Save as file" and saved code blocks use content names ("Home.tsx" for a block declaring `function Home`, "parse_logs.py", or the file named in its first comment). |
| `src/agent/files.test.ts` | One expectation updated: `study-plan.xlsx` is now `Study plan.xlsx`. |

## Examples (from the code, not invented)
| Request, attachment | File name |
|---|---|
| "fix the auth ui in pothub and zip it", pothub-main-fixed__2_.zip | pothub auth-ui fixed.zip |
| "Please fix this project and give me the zip", pothub-0_5_10-account-sites-limits.zip | pothub fixed version.zip |
| "give me the source code of WyBuild as a zip" | WyBuild source code.zip |
| "build me a simple todo app with ReactJS and zip it" | todo app source code.zip |
| "fix this file", App.tsx | App fixed version.tsx |
| cover-letter request, reply heading "Summary" | Cover letter for the software engineer job at Acme.pdf |

## Verified, and not verified
- Ran under Node 22 with a stand-in for `vitest`: 12 new naming tests pass; `search.test.ts` passes once its `../security/api` import is stubbed (an earlier failure of it in my sandbox was only that missing import).
- Syntax check passes for every changed .ts file. Not run: `tsc`, `vitest`, `vite build` and `files.test.ts` (no `node_modules`, no network here), so the type check and the full test suite still need `npm ci && npm run typecheck && npm test`.

## Limits
- Naming is rule-based. A request that names no app, no archive and no clear subject falls back to "Pothub files" or "Pothub document", never a date or the start of the request.
- Not changed: video and image names (already the prompt), editor exports (the project's own name) and the backup file.
- The repo root holds stray copies (App.tsx, agent/, auth/, ui/Account.tsx, styles.css) next to src/. They are not the files edited here.
