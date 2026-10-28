# Android device checklist (manual; not executed in this environment)

Record device model, Android version, APK version, date, tester and evidence for every test.

- [ ] Install a clean standalone APK; launch, background, force-stop and relaunch.
- [ ] GitHub OAuth deep link opens the correct installed app; expired/mismatched state fails safely.
- [ ] Vercel OAuth return works or shows a clear unsupported/configuration message.
- [ ] Generate TXT, ZIP, PDF, DOCX and XLSX; verify byte length and open each with a real viewer/parser.
- [ ] Save each file; verify exact path in Android Downloads. If unavailable, verify `Documents/Pothub` fallback and that success text reports the actual location.
- [ ] Share a file to Files and Drive using Android share sheet.
- [ ] Android 9 and below: storage permission granted/denied paths; denial must not falsely report success.
- [ ] Local notification permission, remote push, app closed, duplicate issue suppression and recurring issue notification.
- [ ] Google Play Billing sandbox purchase for every pack; server verifies package/product/token with Google Play Developer API; acknowledge; grant exactly once; replay same token; refund/revoke and confirm ledger adjustment.
- [ ] Offline: open saved history and files; diagnosis/commit/payment actions show network-required messages.
- [ ] Deep links cannot inject arbitrary callback data; expired native handoff is rejected.
- [ ] Check safe-area insets, keyboard, 390×844 layout, TalkBack labels, reduced motion and visible focus.

**Current status:** Not run. A connected Android device, generated APK, Play Console test product/service account and configured provider credentials are required.

## Updated APK checklist — Flutterwave temporarily enabled
- [ ] Configure the deployed API URL in Settings and confirm `/api/health` reports billing ready.
- [ ] Sign in to GitHub, open Credits and select each pack.
- [ ] Complete a Flutterwave sandbox purchase from the APK; confirm any bank redirect opens in Capacitor Browser and returns to Pothub.
- [ ] Confirm credits are granted only after server verification; retry the same reference and confirm no duplicate grant.
- [ ] Confirm declined, pending and abandoned payments do not grant credits.
- [ ] Confirm legal links open in the external browser window.
- [ ] Confirm Inbox findings open the corresponding saved project.
- [ ] Confirm MediaStore Downloads, fallback Documents/Pothub, and native share sheet on Android 10+ and older supported Android versions.
- [ ] Before Play Store publication, disable Flutterwave digital-credit purchases in the APK and implement/test Play Billing consumables and server verification.
