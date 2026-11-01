# App icon & color

The **App icon** menu page lets a user pick a pot shape and a color. The choice drives three things:

| Target | How |
| --- | --- |
| App color | `applyAppIcon()` sets `--accent` / `--accent-hover` on `<html>` (dark and light values per color). |
| Browser tab, installed web app | `<link rel="icon">`, `<link rel="apple-touch-icon">` and `<link rel="manifest">` are swapped to the pre-rendered files in `public/icons/themes/`. |
| Android launcher (APK) | `AppIcon.setIcon({ id })` enables one generated `PotIcon_<form>_<color>` activity-alias and disables the others. |

The choice is saved in IndexedDB (`settings` key `app-icon`) and mirrored to `localStorage` (`pothub-app-icon-v1`) so `pages/index.jsx` can apply it before the app bundle loads. The default (Classic + Midnight) is the original Pothub icon and manifest.

## Device behaviour

- **Android APK**: switches immediately; some launchers take a few seconds to redraw. Requires an APK built after running `npm run android:configure`.
- **Installed web app (Android Chrome)**: Chrome refreshes the icon from the manifest on its own schedule (about a day).
- **iPhone / iPad**: iOS reads the icon when the app is added to the Home Screen; remove and re-add it to pick up a new icon.

## Adding or changing a pot or color

1. Edit `src/lib/app-icon-data.js` (512x512 canvas; roles `main` = white, `cut` = carved detail in the background color; use only `M L H V C S Q A Z` path commands).
2. `python3 design/icons/measure-fit.py` and paste the printed `s/cx/cy` into the form's `fit` (keeps the artwork centered inside the maskable safe zone).
3. `python3 design/icons/render-icons.py` regenerates `public/icons/themes/*.png` and `*.webmanifest` (needs Python with Playwright + Chromium + Pillow). `--sheet` only writes `design/icons/contact-sheet.png` for review.
4. `npm run android:configure` regenerates the Android vector icons and aliases.
5. `npm test` (see `tests/app-icon.test.mjs`).
