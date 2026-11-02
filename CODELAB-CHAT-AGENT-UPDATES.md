# Codelab and chat quality updates

- Creator chat and the repository-scoped developer chat now share reader-controlled auto-follow behavior.
- New messages/answers scroll into view while following is enabled. Touching or pointer-down inside the transcript, or scrolling upward, pauses follow mode and cancels an in-progress smooth scroll. Scrolling back to the bottom resumes it. Sending a new prompt explicitly resumes follow mode.
- Creator, repository chat, and repository diagnosis prompts now request more rigorous reasoning, useful Markdown structure, evidence-based answers, and explicit uncertainty rather than fabricated test/tool results.
- Agent providers, API keys, and model IDs still come from the user's saved API & Agents configuration (BYOK). Prompting can improve how a model is used but cannot make a weaker underlying model identical in capability to Claude. For Claude-level capability, configure a current Claude model and valid Anthropic/OpenRouter key in API & Agents for the relevant task.

## Verification and remaining constraints

- Source-level tests cover chat auto-follow wiring, reader pause/resume, configured-agent routing, and GitHub-backed Codelab actions.
- JSX/JS source transpilation syntax checks passed and `node --check server/app.js` passed.
- A full production build was not run successfully in this environment because project dependencies are not installed (`pdfjs-dist/legacy/build/pdf.worker.mjs` is missing). Run `npm install` and then `npm run build` in the deployment environment.
- Durable GitHub commit jobs that survive a closed tab/WebView are still not implemented; current commit actions require the client to remain open until the API operation completes.
