# pothub prompt-sharpening fixed

## What your screenshots show
- The picture itself was routed correctly: `pothub route --task image` chose Stability AI Stable Image Ultra and the key "sd3.5-large-turbo" (your Stability key, ticked for Images). No Gemini model was ever asked to make the image.
- The Gemini line, `gemini-3.8-flash enhance-prompt`, is a separate optional step, "Sharpen my prompts first before generating". The code only runs it when Settings > Workflow has that box ticked (it is off by default) or the message contains /enhance, and it needs a Gemini key ticked for Text & documents. It waited 8 s, got no answer and fell back to your own prompt, which is why generation started late.
- Separately, every request first lists the models of each connected provider (`providers detect --models`), including a Gemini text key. That only reads a model list; it generates nothing.

## What changed
| File | Change |
|---|---|
| `src/agent/workflow.ts` | The sharpening step now says what it is ("Sharpening your prompt with Google Gemini (Settings > Workflow)"), gives up after 4 s instead of 8 s, and after one failure is skipped for 10 minutes so it cannot slow later requests. The failure message tells you to turn it off in Settings. The code comment records that the image itself always goes to the provider ticked for Images/Video. |
| `src/pages/Settings.tsx` | The setting's text now says it is off by default, that it sends the prompt to Google Gemini, that it needs a Gemini key ticked for Text & documents, and that the image still uses only your Images provider. |

## What to do now
Open Settings > Workflow and untick "Sharpen my prompts first before generating". Image requests then contact only Stability for the picture.

## Not changed, and not verified
- I did not change the saved setting or its default (already off), because I cannot see your stored settings.
- Not run: `tsc`, `vite build`, `vitest`; the change is small and the file passes a syntax check. Not tried against live providers.
- Whether `gemini-3.8-flash` is a real model on your key is not something I can check; it comes from your Gemini key's own model list.
