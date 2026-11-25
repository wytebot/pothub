# Phone-only sandbox deployment

This project can be deployed and updated from GitHub's mobile web/app UI. The actual runner needs a dedicated Linux Docker host; a phone cannot provide the Docker daemon, and common serverless platforms do not expose a privileged Docker socket.

## One-time host requirements
- Dedicated Ubuntu 24.04 VPS with SSH access and non-interactive `sudo` permission for the deployment user. The deployment workflow installs Docker Engine automatically when missing and enables it.
- DNS A/AAAA record for the runner domain pointed at the VPS.
- Host firewall permits inbound 80/443 only (SSH restricted to your IP where practical).
- Docker socket remains on the dedicated runner host. The runner container is a trusted controller and Docker socket access is host-root equivalent.

## GitHub Actions setup (phone)
Open the repository on GitHub mobile/browser → **Settings → Secrets and variables → Actions → New repository secret** and add:

- `SANDBOX_HOST`: VPS public IP or hostname
- `SANDBOX_USER`: SSH deployment user (avoid root; user must administer Docker)
- `SANDBOX_SSH_KEY`: private key used for deployment
- `SANDBOX_KNOWN_HOSTS`: verified SSH host-key line(s) from the VPS, not an unverified `ssh-keyscan` output
- `SANDBOX_DOMAIN`: runner DNS name, e.g. `sandbox.example.com`
- `ENGINE_RUNNER_TOKEN`: long random bearer secret (use a password generator; never reuse API keys)
- `GHCR_PULL_TOKEN`: GitHub PAT with `read:packages` permission to pull this repository's container packages
- `GHCR_USERNAME`: GitHub username that owns the PAT


## Automatic deployment
1. Commit/push the runner source to `main` or `master`.
2. **Publish Pothub sandbox images** builds and pushes the runner and Node engine to GitHub Container Registry (GHCR).
3. **Deploy Pothub sandbox runner** automatically deploys over SSH only when all deployment secrets above exist. It installs Compose files, logs into GHCR, pulls the published images, and starts the runner + Caddy HTTPS proxy.
4. Caddy obtains and renews HTTPS certificates automatically. DNS and ports 80/443 must be correct first.
5. In Vercel project → Settings → Environment Variables, set server-only values:
   - `ENGINE_RUNNER_URL=https://<SANDBOX_DOMAIN>`
   - `ENGINE_RUNNER_TOKEN` = the same secret value as the runner token
6. Redeploy Vercel. Use the app's sandbox test and check `https://<SANDBOX_DOMAIN>/health` (health endpoint reports Docker availability; do not expose the runner on port 8788).

## Flutter/Android checks
The Android/Flutter engine is intentionally not built on every push because it is large and slow. In GitHub Actions, manually run **Publish Pothub sandbox images** and set `build_flutter=true`. The deploy runner then references that optional image for Flutter project checks.

## Security and cost
- The runner is not suitable for shared multi-tenant deployment without additional host isolation, monitoring, and hardened policies. Docker socket access can grant host-root control.
- Builds are resource-limited, and project build containers are network-isolated. Dependency-fetch stages need internet access and must be further restricted by the host firewall.
- This workflow does not provision a VPS or DNS for free. The host, domain, SSH access, and secrets are required before the runner can be deployed.
- If deployment secrets are missing, workflows still run CI and publish images; runner deployment is skipped with a summary message.
