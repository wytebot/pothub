# PotHub v0.1.11 — loading, sign-in, composer and typography

## Changes
- Replaced the app restoration screen with a centered spinner only; no loading copy or logo.
- Replaced lazy workspace text fallbacks with the same spinner-only loading surface.
- First sign-in screen now offers Google only. GitHub and Vercel remain available from Linked Accounts after sign-in.
- Added a theme-aware animated welcome surface using the current app accent and background variables.
- Hardened the Creator composer send icon positioning so it remains inside the input bar across mobile, desktop and Capacitor layouts.
- Reset the Creator prompt immediately when a send is accepted; the existing textarea auto-height reset effect returns it to its initial height.
- Applied the font-size setting to the app root typography scale as well as the existing chat/code typography variables.

## Files
- `src/ui/App.jsx`
- `src/ui/styles.css`
- `package.json`
- `UPDATE-NOTES-v0.1.11.md`

## Validation
- JSX parser/build validation: pending in this environment.
- Vercel deployment and live Capacitor/browser verification: pending.
