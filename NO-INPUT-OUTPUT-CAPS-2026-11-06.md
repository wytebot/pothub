# Removed app-side input/output caps (Creator chat + repository Edit chat)

Limits now exist only between the user and their own API provider (BYOK).

Input
- src/ui/App.jsx: removed the >12,000-char conversion of the message into a PDF.
- src/ui/WorkspaceSection.jsx: removed the >8,000-char conversion in repository Edit.
- server/app.js (/api/agent/chat/stream): removed zod max on `message`, `history[].content`, attachment `textContent`, and the 160,000-char attachment slice.
- server/app.js (/api/developer/chat): removed zod max on `message`.
- server/lib.js: `redactSecrets` silently truncated to 25,000 chars; it now takes an optional `max` and chat passes `Infinity`.

Output
- No `max_tokens` / `max_completion_tokens` / `maxOutputTokens` is sent to OpenAI-compatible or Gemini providers (provider default = model maximum).
- Anthropic requires the field: 64,000 is sent first; if the model's own maximum is lower the existing retry halves until accepted.
- Cut-off replies auto-continue up to 40 times (was 3), bounded by the stream time budget.
- Optional operator caps: AI_CHAT_MAX_OUTPUT_TOKENS, AI_CHAT_MAX_CONTINUATIONS.

Hard ceilings that remain (infrastructure, not app policy)
- Vercel request body limit (~4.5 MB; Express is set to 4 MB).
- Vercel function duration (stream budget 50 s per request).
- The user's model context window and their provider's output limit.
