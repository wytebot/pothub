# Pothub Codelab 0.9.0 — no-cost developer value

Codelab adds useful developer workflows without a hosted execution service or extra inference provider. AI calls use the user's configured BYOK model provider; any provider charges remain the user's responsibility.

## New workflow
- Review workspace: contextual AI review of opened/staged files (bounded 48,000-character context).
- Explain project: repository architecture, entry points, dependencies and run instructions.
- Create PR: GitHub API pull request from current branch to a selected target branch.
- Audit: offline heuristics for likely credentials, private-key strings, dynamic eval, DOM injection, shell execution patterns, HTTP links and TODO/FIXME markers.
- Check: JSON parse validation on opened/staged JSON plus the same audit checks and repository metadata hints.
- Sandbox terminal commands: `help`, `clear`, `pwd`, `ls [path]`, `cat [path]`, `git status`, `git diff [path]`, `npm run`, `preview [file.html]`, `run [file.js]`, `audit`, `check`.
- Preview: sandboxed HTML iframe. External resources may load inside the preview; the preview is isolated from the parent app.
- JS runner: JavaScript in a worker inside an opaque-origin sandboxed iframe; CSP blocks outbound connections; parent clears the iframe after four seconds. It has no Node APIs, shell, filesystem, npm install, or full browser DOM.

## Limits
The terminal is a command helper and sandbox runner, not a true shell or Linux environment. It does not run `npm install`, arbitrary shell commands, Docker, or native compilation. Static audit/check are heuristics and are not substitutes for compiler, tests, dependency scanning, or professional security review. Full dependency install, build, tests, Android build, and live GitHub integration remain unverified because npm dependency installation timed out in the build environment.
