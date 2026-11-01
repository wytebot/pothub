# Changelog — Google Auth Restore

| ID | Status | Change | Files | Test |
|---|---|---|---|---|
| AUTH-RESTORE-01 | Fixed in source | Restore authenticated Google Firebase users even when `preferred-role` is missing | `src/ui/App.jsx` | `Google Firebase user restoration does not depend solely on preferred-role Dexie row` |
| AUTH-RESTORE-02 | Fixed in source | Ensure token listener validates the returned PotHub user and reports session-exchange failure | `src/ui/App.jsx` | `ID token listener recognizes Google provider and validates returned PotHub user` |
| AUTH-RESTORE-03 | Preserved + regression-tested | Keep Firebase exchange single-flight per ID token | `src/ui/App.jsx` | `Firebase session exchange remains single-flight per ID token` |
| AUTH-RESTORE-LIVE | Needs live test | Verify Google redirect, Firebase ID token, Vercel exchange endpoint, and Creator restore in production | Firebase/Vercel runtime | Manual browser/PWA/Capacitor test required |
