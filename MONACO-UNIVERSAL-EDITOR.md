# Universal Monaco editor integration

PotHub now uses Monaco Editor (`@monaco-editor/react` + `monaco-editor`) for fenced AI code blocks and repository code generated in Codelab chat.

- Code blocks support editable, language-aware Monaco views with plain-text fallback for unknown formats.
- Copy and Download actions are available on displayed code blocks.
- Generated repository file blocks retain the existing target-path selector and **Commit this file** / **Commit all files** actions.
- Language detection uses the fenced code language and, for repository files, the file extension.
- Monaco is loaded client-side only to avoid server-side rendering/browser-global issues.

A full production build was not verified in this environment because dependencies are not installed. The test run reported 182 passing tests and 27 test-file failures caused by missing installed packages (including `express`, `firebase-admin`, and `typescript`), so run `npm install`, `npm run check`, and `npm run build` in CI before promoting to production.
