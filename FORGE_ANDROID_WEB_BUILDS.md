# Pothub Forge Android and Web builds

Forge build dispatch is Premium-gated server-side using verified Firebase ID-token custom claims (`premium`, `pothubPro`, `plan=pro`, or `pothubPlan=pro`) with the `pothubProUntil` expiry checked when present. A UI paywall is informational; the endpoint is authoritative.


## Outputs
- Web: installs project dependencies, runs available test/typecheck/lint scripts and production build, then archives common static output directories (`dist`, `build`, `out`). Server-rendered web frameworks that don't export static output are not supported as deployable web artifacts yet.
- Flutter: `flutter pub get`, `flutter analyze`, `flutter test`, debug APK, optional release APK and AAB.
- Native Android/React Native/Capacitor with Android Gradle project: Gradle tests and debug APK; release APK/AAB are attempted and retained when successful.
- APK is the installable test package. Release APK/AAB signing is not provided by Forge because it does not store user signing credentials. Release output is unsigned unless the project's own build configuration signs it, and Play Store upload requires a properly signed AAB.

## Dispatch setup
The backend API `api/forge.js` requires `POTHUB_FORGE_REPOSITORY`, `POTHUB_FORGE_BRANCH`, and `POTHUB_FORGE_GITHUB_TOKEN`. The repository token must be scoped to the Pothub workflow repository and have Actions workflow-dispatch write permission. The workflow lives at `.github/workflows/pothub-forge-free-worker.yml`.

Only public repositories are accepted. Build artifacts are uploaded to GitHub Actions with 7-day retention; direct artifact download inside Pothub is not implemented yet. The runner is an ephemeral GitHub-hosted worker and jobs are globally serialized to reduce collisions. Free compute is quota-limited and availability/cost depends on GitHub's current policy and repository settings.


## Safety notes
Build workflows execute project build scripts from public repositories on ephemeral hosted workers. Do not provide signing keys, deployment secrets, or other sensitive environment variables to these jobs. GitHub hosted runners are not a dedicated hostile-code sandbox; untrusted project scripts can consume the job's available compute until timeout. Dispatch rate limiting in the serverless API is best-effort per warm instance, not a durable global quota.
