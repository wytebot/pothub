# Premium BYOK features wired in this pass

## Offline Tab autocomplete
- Optional, user-triggered WebLLM integration using `Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC`.
- Loads a small local model in a WebGPU-capable browser; model download is required once, then WebLLM can reuse browser-cached model files offline.
- If WebGPU/model loading is unavailable, repository editing still works normally. No server GPU or PotHub model key is used.

## Batch image generation
- Creator UI supports 1–10 images.
- Server validates the same 1–10 limit and reserves one credit per requested image; failed/incomplete batches release the reservation.
- Gemini requests are sequenced as single-image calls to avoid provider candidate-count limits. Other adapters receive the requested batch count and are validated for complete output.
- Provider API charges remain the user's own BYOK charges.

## Image → prompt → video
- Attach an image in Creator and press **Image → prompt → video**.
- The Chat BYOK agent analyzes the image, then creates a motion prompt, then the Video BYOK agent starts the video job.
- These are three agent operations (image analysis, prompt creation, video delivery), each governed by the existing one-credit-per-successful-agent-operation policy. Provider API usage is billed by the user's providers.
- Requires a working Chat agent that supports image input and a working Video agent. The chain reports errors rather than fabricating results.

## Verification
- `node --check server/app.js` passed.
- Static release audit passed.
- 11 targeted billing, backup, image adapter, and video integration tests passed.
- Full Next.js build, package install, WebGPU model download, live provider calls, browser offline reload, and Capacitor/Android device test were not available in this run. Do not consider these environment-dependent checks passed until executed.
