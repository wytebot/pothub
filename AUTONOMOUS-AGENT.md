# Pothub autonomous coding agent

## Current workflow

Codelab's Autonomous repair agent reads text source files directly from the selected GitHub repository and includes the current local workspace buffers for open/staged files. It selects an enabled Text provider/model from the user's existing encrypted local vault, including the configured gateway path where supported. Provider credentials are not written into repository files or sent to Pothub's own API by this feature.

The agent performs two model passes:

1. Implementation pass: identify the requested root cause/change and return complete replacement contents for the files it inspected.
2. Review pass: review the candidate patch against the original source and request, then return the corrected complete-file patch.

The patch is validated for path traversal, protected paths, inspected-file membership, per-file size, file count and total size. Pothub stages the reviewed changes locally in Codelab. The user must inspect the diff and explicitly commit. Pothub refuses to commit staged changes directly to the repository's default branch; create/switch to a repair branch first.

## Safety boundaries

- The agent only reads GitHub repository text files and the user's current Codelab buffers; it does not accept uploads.
- It does not execute commands on the user's device or claim tests passed.
- It does not push code or open a PR automatically from the model response.
- Workflow files under `.github/`, `.env*`, private keys and `.git` paths are blocked from autonomous edits.
- Only files actually inspected by the agent can be modified. Files over the per-file context threshold are skipped rather than truncated and overwritten.
- Suggested validation commands are advisory until executed by a real runner.
- The configured AI provider/model is selected from the user's existing Text defaults. Provider API charges remain with the provider account.

## Required production validation

Before enabling broad autonomous repair for customers, validate this flow against disposable GitHub repositories for each supported provider and model family. Test invalid provider keys, truncated model output, malicious path proposals, oversized files, stale branches, branch protection, GitHub API rate limits, offline transitions, browser CORS, and Capacitor native networking. Then execute actual package-manager/test/build commands in GitHub Actions or another isolated runner and attach the exact run URL and result to the repair record. A model review is not a substitute for compiler/test execution.
