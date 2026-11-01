# Codelab notes

- GitHub is the source of truth. Repository browse/open operations are free; Codelab does not mirror a repository into a server-side code store.
- Codelab is a Developer feature and requires a GitHub-authenticated Developer session. Creator/Google accounts must not see Codelab, Launchpad, or Developer-only free tools.
- Repository creation is performed by `/api/github/create-repo`; the response should be normalized to include `id`, `owner`, `name`, `full_name`, `description`, `html_url`, `private`, and `default_branch`. A newly created repository can take time to expose its initial tree; file loading should retry transient 404/409 responses and show an initialization status.
- Branch names may contain `/`; validate each segment and encode path segments before calling GitHub APIs. Truncated Git Trees responses must be surfaced instead of silently pretending the list is complete.
- Large source-file lists should use a searchable, windowed picker rather than thousands of native `<option>` nodes.
- `Fix it in chat` and `Propose repair` are separate flows. Repair proposals require an explicit target file if diagnosis did not identify one. AI suggestions must not commit automatically; show a diff and validate the proposed patch before enabling commit.
- Vercel integration remains in this source tree (OAuth, projects, deployments, logs). It is not removed; it is intended for Developer-only use. Keep its environment requirements in `ENVIRONMENT_VARIABLES.md` and `docs/DEPLOYMENT_ENVIRONMENT.md`.
- Credit policy: repository browsing/opening is free. Successful toolbar mutations such as delete, PR creation and revert are charged according to server-side operation rules; failed operations must release reservations. AI inference is BYOK-only; provider model discovery is free.
