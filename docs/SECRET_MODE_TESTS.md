# Secret Mode release checklist

## Browser (HTTPS)
1. Clear site data and open Pothub: the page must open without a biometric gate.
2. Open Use your agent and enable Secret Mode. A platform-authenticator prompt should appear.
3. Cancel enrollment: Secret Mode must remain disabled.
4. Enroll successfully, add a test provider key, enable Use your own agent, and save.
5. Close and reopen Use your agent: authentication should be requested; canceling must keep provider settings hidden.
6. With Secret Mode locked, trigger a BYO-agent operation. It must fail locally with the locked message and must not send the provider key.
7. Unlock and retry; verify the operation succeeds.
8. Switch to another app/tab; return. The lock should be active again.
9. Reload the page: provider keys must be gone and must not exist in localStorage/sessionStorage.
10. Check browser developer tools: no provider key should be stored in Web Storage. This is not a defense against an attacker controlling same-origin JavaScript/devtools.

## Capacitor Android
1. Run `npm install`, `npx cap sync android`, and build the APK.
2. On a physical Android device with biometrics enrolled, verify setup, success, cancellation, and failed authentication.
3. Background the app and return; verify it relocks.
4. Verify that Secret Mode works when launched as a standalone APK and does not depend on browser WebAuthn.
5. Test a device without biometrics: enrollment must fail safely with a clear message.

## Release boundary
Source tests and static audits do not replace HTTPS browser tests, physical Android tests, production deployment checks, or a security review. Browser WebAuthn is not server-verified in this version.
