# PotHub 0.1.15 — native UX and artifact memory

## Implemented
- Generated output files are remembered per signed-in account using an IndexedDB attachment pointer.
- Debug/repair prompts automatically include the most recently generated file as an additional bounded attachment, when available. New generated files replace the remembered pointer.
- Codelab notifications now request and track browser or Capacitor local-notification permission, with enable/disable preferences and a notification helper.
- Added pull-down refresh gestures to the Codelab shell; repository and home views refresh repository data without reloading the app.
- Google OAuth explicitly requests `prompt=select_account` so users can choose among Google accounts.
- Native OAuth return closes the Capacitor in-app browser when the `ai.pothub.app://auth` deep link is received, then existing one-time native session exchange continues.
- Added configuration guidance explaining why private Google credentials must not be committed as a root `google.json`.

## Verification
- `node --check` passed for the modified server and new JavaScript modules.
- Added and passed focused artifact-memory tests.
- A full Android build and live OAuth/notification permission test still require the configured Android project, deployment secrets, and a device.
