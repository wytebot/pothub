# MonyGist 0.16.4 — Native build preferences and manual repair bundles

- Chat detects APK/AAB build requests and opens a native-build preference dialog when a GitHub repository is tagged.
- Cloud builds accept public repositories and private repositories accessible to the configured Forge token.
- Native capability selection (Capacitor) installs plugins, adds Android permissions, and generates a callable TypeScript helper. Native sign-in and API configuration is scanned and included in build audit artifacts.
- Build preferences include tests, lint/type checks, debug/release outputs, dependency audit, symbol/mapping collection, and use of existing signing config.
- GitHub Actions remains the build executor; the Deployments page adds a Cloud Builds tab with run status, faded live steps, and failed-job log excerpts. Failed runs can be transferred into chat for automatic AI explanation and a repair prompt.
- Generated ZIPs can be downloaded for manual upload. Automated GitHub commits are Pro-gated in the app; Free failure repair produces a ZIP bundle.
- Existing `POTHUB_` Forge environment variable names are unchanged.

## Important build setup

The backend still requires existing `POTHUB_FORGE_REPOSITORY`, `POTHUB_FORGE_BRANCH`, and `POTHUB_FORGE_GITHUB_TOKEN` settings. For private source repositories, add a worker-repository secret named `POTHUB_FORGE_GITHUB_TOKEN` with read-only Contents access to private source repositories. The workflow repository needs Actions dispatch permission. Do not store keystore credentials in chat or plain variables.

Native plugin bridge generation is currently supported for Capacitor projects. It installs the selected plugins and writes permission declarations and helper methods; app-specific screen/consent integration, Firebase push credentials, and signing configuration still require project-level setup and review.
