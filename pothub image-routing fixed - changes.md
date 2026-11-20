# pothub image-routing fixed: picture requests no longer go to the text model

## What was found
Two separate causes sent a picture request to the text side:
1. **Chat (`interpret` in `src/models/router.ts`)**: a list of "document words" (story, code, table, email, report, script, api...) vetoed a picture request whenever the SUBJECT contained one. "Create an image of a girl reading a story", "generate a picture of a code editor", "create an image of a table with food", "make me a picture of my dog writing an email" were all classed as writing and answered by the text model.
2. **Image Studio (`src/pages/ImageStudio.tsx`)**: it called `runImage` without `routed: true`, so `planImage` re-read the wording and could refuse with "This reads like a request for writing rather than a picture". A page that only makes pictures should never re-judge the wording.
Also, a non-image file attached to the message always made the request a question about that file, even for "create an image of a lion".

## What changed
| File | Change |
|---|---|
| `src/models/router.ts` | A request that starts with a make/create/generate/draw verb and names a picture (image, picture, photo, poster, logo, wallpaper...) as the thing being made is a picture request whatever its subject mentions. "An image of ..." / "a photo of ..." now also wins over an attached document. Added `document(s)` to the writing words so "make a document about photography" is text. |
| `src/pages/ImageStudio.tsx` | Passes `routed: true`. |
| `src/agent/codeWork.ts` | A sentence about a photo, picture, logo or video is not code work unless it also has code words, so "improve this photo" after a code chat is not taken for "improve the code". "fix the image upload bug" is still code work. |
| `src/agent/imageRouting.test.ts` (new) | 6 tests for all of the above. |

## Still true (kept on purpose)
With a non-image file attached, "make a logo for my app" is still read as a question about that file, because a request like "make a summary of this" must keep working. Say "an image of ..." or start the message with /image to force a picture.

## Verified, and not verified
- Ran under Node 22 with a stand-in for `vitest`: 6 new routing tests, 13 code-work tests and 12 naming tests pass; the existing `interpret` expectations from `agent.test.ts` were re-checked one by one (0 differences).
- Not run: `agent.test.ts` itself, `tsc`, `vite build`, the real `vitest`. Run `npm ci && npm run typecheck && npm test`.
- Not tried with a live image key.
- If your image request still gives text, check AI Providers: a key must be ticked as default for Images. Without one the app now says so ("Tick a ... key as default for Images"); it does not use the text key.
