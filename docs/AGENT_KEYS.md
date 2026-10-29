# API & Agents

Agents are configured separately for Diagnosis, Fix generation, Chat, Image and Video. Multiple candidates can be saved per function; the default is tried first and other working agents are used as fallbacks. Provider keys are never included in backups.

## Providers
- Gemini supports text/vision requests and the dedicated image/video adapters. Use an image-capable model for Image and a supported Veo model for Video.
- OpenAI-compatible and Anthropic-compatible endpoints are available for text/vision functions. The default endpoints are the official public HTTPS APIs. Custom public HTTPS endpoints require `POTHUB_ALLOW_CUSTOM_AGENT_ENDPOINTS=true` on the server. Local/private endpoints are rejected.
- Image and Video are restricted to Gemini-compatible models in the current UI; a text connectivity test does not guarantee a model supports image or video generation.

## Storage and transport
- Browser: each API key is AES-GCM encrypted in IndexedDB using a non-extractable WebCrypto key stored in IndexedDB.
- Capacitor Android: the AES key and session token use Android Keystore-backed secure storage; agent values remain AES-GCM encrypted in IndexedDB.
- API keys are sent in the POST body only for the specific request and are not persisted server-side. Hosting/proxy logs must not capture request bodies.
- Sign-out removes local agent secrets and the session token. Backups omit agent configuration and keys.

## Optional page lock
“Require device unlock for API keys” is off by default and affects only the API & Agents page. Browsers use WebAuthn platform-authenticator verification on HTTPS; Android uses the native biometric prompt. It does not gate sign-in, app launch, workspaces or navigation outside that page.

## Testing
Test each configured agent and verify the response before marking it default. The connectivity test is not a quality benchmark. Test failure/fallback for each function and confirm keys do not appear in browser storage, backup files, request logs or error messages.
