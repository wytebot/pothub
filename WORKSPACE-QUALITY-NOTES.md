# Pothub 0.8.0 workspace quality notes

## Delivered in this patch
- Reworked signed-out welcome page into a code-editor inspired, responsive layout.
- Added consolidated composer dropdown actions for files, deep research, developer mode, file creation, and Codelab.
- Expanded accepted file types; the attachment picker accepts all file types while media remains intentionally unsupported.
- Expanded text output extension detection for explicitly requested text/code/config formats.
- Workflow timeline now includes step events and full current step labels.
- Codelab Git blob uploads are batched in groups of four and show progress. Individual Git blobs are kept intact; the GitHub REST Git Data API does not support splitting one file blob into partial commits.
- Capacitor back navigation returns to the root route before app exit.

## Limits / transparency
- Universal file formats are not technically possible: proprietary, encrypted, scanned, binary and unsupported formats may not be readable or constructible without dedicated libraries, native encoders, or source tooling. The app provides best-effort text extraction and text-based output generation.
- Terminal progress is a workflow awareness feed, not an unrestricted local shell. Actual shell execution needs a sandbox and explicit permission design; do not execute arbitrary model-generated commands on a user's device.
- GitHub blobs are uploaded whole. The workspace limits edited files and batches multi-file blob uploads to keep the workflow responsive.
- Build and full integration tests were not run because npm installation timed out.
