# MonyGist GitHub cloud coding agent

The repo-owned workflow (`.github/workflows/monygist-agent.yml`) dispatches a coding job to GitHub Actions, so the app does not need to remain open. This is a repo-scoped worker; users must install the workflow into their target repository and configure its provider credentials.

## Required configuration in each target repository

1. Copy `.github/workflows/monygist-agent.yml` and `scripts/monygist-agent.mjs` from MonyGist into the target repository and commit them.
2. In **Settings → Secrets and variables → Actions → Secrets**, add `MONYGIST_API_KEY` (provider API key).
3. Under **Variables**, add `MONYGIST_PROVIDER` (`openai`, `anthropic`, `gemini`, `xai`, `deepseek`, `openrouter`, `groq`, `mistral`, or `together`) and `MONYGIST_MODEL` (model ID).
4. Enable Actions. Ensure repository Actions permissions allow workflow commits; workflow uses `contents: write`.
5. Ensure the target branch accepts direct workflow commits, or dispatch to a working branch.

## Security and limitations

- The workflow sends selected, tracked text files (bounded) and the task prompt to the configured provider. It excludes common credential and environment files. Never commit credentials.
- Model-generated changes are committed to the dispatched branch. Review before merging/production release.
- The worker has write permission to repository contents and therefore is a high-trust automation. Protect branches, use least-privilege tokens and audit Actions runs.
- This worker is an initial single-pass patch generator with bounded context and a best-effort build check, not a fully autonomous multi-agent repair loop. Provider quality and output limits vary.
- Vercel non-sensitive variable helper refuses names likely to contain secrets. Sensitive values should be configured through Vercel's protected UI, not copied to logs or the chat.
