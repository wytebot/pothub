# Pothub Forge Android and Web builds

Forge build dispatch is Premium-gated server-side using verified Firebase ID-token custom claims (`premium`, `pothubPro`, `plan=pro`, or `pothubPlan=pro`) with the `pothubProUntil` expiry checked when present. A UI paywall is informational; the endpoint is authoritative.


## Outputs
- Web: installs project dependencies, runs available test/typecheck/lint scripts and production build, then archives common static output directories (`dist`, `build`, `out`). Server-rendered web frameworks that don't export static output are not supported as deployable web artifacts yet.
- Flutter: `flutter pub get`, `flutter analyze`, `flutter test`, debug APK, optional release APK and AAB.
- Native Android/React Native/Capacitor with Android Gradle project: Gradle tests and debug APK; release APK/AAB are attempted and retained when successful.
- APK is the installable test package. Release APK/AAB signing is not provided by Forge because it does not store user signing credentials. Release output is unsigned unless the project's own build configuration signs it, and Play Store upload requires a properly signed AAB.

## Dispatch setup
The backend API `api/forge.js` requires `POTHUB_FORGE_REPOSITORY`, `POTHUB_FORGE_BRANCH`, and `POTHUB_FORGE_GITHUB_TOKEN`. The backend dispatch token must have Actions workflow-dispatch write permission on the worker repository and source-repository read permission for any private repository build. The worker repository must also have a `POTHUB_FORGE_GITHUB_TOKEN` GitHub Actions secret with read access to private source repositories; public builds can use the default checkout token. The workflow lives at `.github/workflows/pothub-forge-free-worker.yml`.

Public repositories and private repositories readable by the configured Forge token are accepted. Build artifacts are uploaded to GitHub Actions with 7-day retention; direct artifact download inside MonyGist is not implemented, so users open the run page and download the artifact there. The runner is an ephemeral GitHub-hosted worker and jobs are globally serialized to reduce collisions.


## Safety notes
Build workflows execute project build scripts from public repositories on ephemeral hosted workers. Do not provide signing keys, deployment secrets, or other sensitive environment variables to these jobs. GitHub hosted runners are not a dedicated hostile-code sandbox; untrusted project scripts can consume the job's available compute until timeout. Dispatch rate limiting in the serverless API is best-effort per warm instance, not a durable global quota.


## MonyGist 0.16.4 build preferences

Build requests can be started from Chat after tagging a GitHub repo with `@`, or from App Builder. The cloud workflow runs on GitHub Actions, and its step timeline, logs, APK/AAB artifacts, and failure analysis are available in Deployments. Public repositories are supported; private repositories require the existing Forge token to have source read access and the worker repository's `POTHUB_FORGE_GITHUB_TOKEN` secret to be set with Contents: read access to those source repos. Existing `POTHUB_` variable names are preserved.

Build preference checkboxes include test/lint, debug/release APK, Node dependency audit, symbol/mapping collection, and use of the project's existing release signing configuration. Capacitor feature selections install compatible plugins, add manifest permissions, and generate `monygist-native-capabilities.ts` helper functions. This does not automatically create app-specific screens, privacy/consent UX, Firebase push configuration, or secure release-signing setup; review and wire the helpers in the app before store release.

Artifacts are retained for 7 days. Free users can download ZIP repair bundles for manual upload. Pro users can request verified automated GitHub commit workflows.
