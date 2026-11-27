# Pothub Engineering Agent Workflow

The Engineering Agent composer preset now activates a bounded three-stage model workflow:

1. **Plan** — review the task and available source context; produce a concise implementation plan, affected areas, risks, and verification checklist.
2. **Implement** — generate the requested changes using the plan and attached context. Requests complete code/file contents and minimal scope.
3. **Review** — a second pass reviews the implementation for regressions, conflicts, unsafe assumptions, and missing requirements, then returns the corrected final deliverable.


Intermediate stage outputs are kept out of the visible chat response. The app exposes progress using the existing compact task timeline. The flow checks for cancellation between stages, uses the existing bounded transient-error retry/fallback handling, and only streams the final review output to the user.


## Execution limitations

This workflow is a multi-pass model orchestration pipeline. It does **not** execute shell commands, run a real build/test suite, modify a local project directory, or provide filesystem rollback/checkpointing. The model is instructed not to claim these actions were performed. Actual sandboxed command execution and transactional project-file checkpoints require a separate execution service and isolated workspace; they are not simulated by this change.

## Isolated validation engine (added)

The Engineering Agent can now merge reviewed file blocks into a sanitized ZIP project and submit it to the Pothub API sandbox proxy. The proxy requires Firebase authentication, per-user rate limiting, and server-only runner credentials. A dedicated runner service is included at `sandbox/runner` and uses Docker to execute project checks in a disposable, resource-limited, no-network container. Checks are reported as pass/fail/skip; missing dependencies are never represented as passed. The patched ZIP is attached even when the remote runner is not configured, and the reply explicitly says validation was not run in that case.


The runner is **not active in production until it is separately deployed**. See `sandbox/runner/README.md`. Do not mount the Docker socket into the main API server; runner deployment must be on a dedicated host.
