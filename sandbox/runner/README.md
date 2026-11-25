# Pothub isolated engineering runner

This is a separate, isolated Docker execution service. It is intentionally **not** hosted inside the main Pothub API container. Access to the Docker socket is effectively host-root; run this on a dedicated runner VM and do not mount the socket into the Pothub API service.


## Build images

```sh
docker build -t pothub/engine:latest -f sandbox/runner/images/node/Dockerfile sandbox/runner/images/node
# Optional mobile image (large; Android SDK + Flutter)
docker build -t pothub/engine-flutter:latest -f sandbox/runner/Dockerfile.flutter sandbox/runner
```

The Flutter Dockerfile requires the base image to exist locally first.

## Run runner service

```sh
cd sandbox/runner
npm install
ENGINE_RUNNER_TOKEN='use-a-long-random-secret' DOCKER_SOCKET=/var/run/docker.sock RUNNER_IMAGE=pothub/engine:latest RUNNER_FLUTTER_IMAGE=pothub/engine-flutter:latest npm start
```

The runner service requires the Docker Engine socket. Put it on a dedicated host and restrict network access to only the Pothub API service. Keep the runner's Docker host firewall egress restricted; project build scripts are untrusted. Containers run with network disabled, no capabilities, no-new-privileges, a read-only root filesystem, memory/CPU/PID limits and a temporary workspace. Archive extraction rejects unsafe paths and omits secret-like files.


## API server settings

Set these server-only environment variables on the Pothub API service:

- `ENGINE_RUNNER_URL=https://your-runner.internal`
- `ENGINE_RUNNER_TOKEN=<same long random token>`

Do not put either variable in `VITE_` or client-side environment variables. The Pothub API proxies requests after Firebase authentication and rate-limits them.


## Limits

- ZIP input: 6 MB compressed
- Expanded workspace: 30 MB
- Files: 1,500
- Per-file: 5 MB
- Execution: 120 seconds per validation container (configurable up to 180 seconds; dependency install stages are separately capped at 60 seconds)
- Container memory: 1.5 GB; CPU: 1 core; PIDs: 256
- Node dependencies are installed in a separate, resource-limited container with network access and npm install scripts disabled. Flutter pub dependencies are fetched in the similarly constrained install stage. The build/test container then runs with network disabled. The runner host firewall should still restrict install-stage egress. Missing or failed dependency setup is reported as skipped, not falsely passed.

The runner reports checks it actually executed. It cannot promise every project will validate successfully; it reports blocked/skipped checks explicitly.


## Start runner and configure API

1. Build the general runtime image: `docker build -t pothub/engine:latest -f sandbox/runner/images/node/Dockerfile sandbox/runner/images/node`.
2. (Mobile projects) Build the optional Flutter image: `docker build -t pothub/engine-flutter:latest -f sandbox/runner/Dockerfile.flutter sandbox/runner`.
3. In `sandbox/runner`, set a long random `ENGINE_RUNNER_TOKEN` and start with `docker compose up -d --build pothub-runner`.
4. Configure the Pothub API with the runner's HTTPS URL and the same server-only token.
5. Restrict the runner host firewall to the Pothub API host; do not expose port 8788 publicly.

Dependency preparation is separate from validation: Node packages are installed in a resource-limited network-enabled container with lifecycle scripts disabled; Flutter pub dependencies are fetched in a limited network-enabled container. The actual build/test container uses `NetworkMode=none`. Egress restrictions on the runner host remain important. Python, PHP and JVM dependencies are not automatically installed; their checks run only with existing caches/dependencies or report failure/skip where applicable.
