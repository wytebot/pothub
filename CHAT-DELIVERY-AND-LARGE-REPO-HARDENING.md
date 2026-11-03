# Chat delivery, attachment handling, and repository commit hardening

## Changes in this update
- Explicit `type="button"` and synchronous tap handlers on Creator Send and Developer repository-chat Send, including resuming chat auto-follow before dispatch.
- A workspace-aware missing-agent notice clears when a matching configured provider/model agent appears in the current workspace.
- Expanded file picker support for common source formats, PDFs, ZIP archives, and MP4/WebM video files, retaining a maximum of 8 attachments and 15 MB per file. Unsupported or oversized items are rejected with a visible message.
- Additional mobile touch/pointer rules keep chat composer controls tappable above the scroll region.
- GitHub commit-fix validates duplicate paths, empty/dot/traversal segments, and sensitive paths before writing blobs. Existing bounds remain 40 files, 1.4 MB per file, and 3 MB total per request. The server creates bounded commits on a new review branch rather than writing directly to the default branch.

## Important limits
- A selected video is retained as a local attachment and can be downloaded; this update does not claim the text-chat model can inspect the full video stream. Video generation remains a separate Video-agent workflow.
- Large repositories should be changed in bounded batches within the 3 MB request / 40-file limit. A request larger than these limits is rejected rather than truncated. The GitHub commit endpoint creates a review branch; it does not merge to the default branch.
- Vercel serverless request-size ceilings still apply. Do not increase the Express JSON body limit beyond the hosting platform's request limit to try to send entire large projects in one HTTP request.
- File storage in this app remains browser/device IndexedDB unless the existing cloud-sync path is available. Downloads require the attachment blob to still exist locally or to have synced successfully.

## Manual checks still required
- Test Creator chat send, stop, regenerate, attachments, image/video downloads, and Developer repo chat on a real Android device.
- Test commit-fix against a test GitHub repository with small and multi-commit change sets, including traversal paths and duplicate names.
- Run the full production build and the complete test suite in the project environment before deploying.
