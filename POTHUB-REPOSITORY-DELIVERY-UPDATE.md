# PotHub repository delivery update

## Included
- GitHub commit endpoint accepts up to 40 changed files and a 3 MiB aggregate text payload; writes blobs in bounded groups (4 files / ~280 KiB) and creates a review branch whose history contains sequential small commits. The default branch is never modified.
- Vercel project discovery exposes linked GitHub repository metadata and project domains where Vercel returns them.
- Vercel redeploy endpoint validates the selected Vercel project and its GitHub link before requesting a production or preview deployment.
- Deployment status polling endpoint and workspace UI show progress, deployment URL and final logs; polling is bounded to three minutes.
- Creator image requests can ask for one or two outputs; generated assets remain stored in local IndexedDB and are attached to the chat history.
- Backup export includes runs, chats, messages, generated attachments, video jobs, credit events, prompt library, backup metadata and non-sensitive local settings. ZIP backups include media blobs within the existing 50 MiB cap. Weekly reminder state is device-local.

## Important constraints
- Vercel redeploy requires a selected project linked to GitHub and Vercel OAuth scopes that permit deployments. Projects without a GitHub link are not force-deployed.
- The Vercel API may return project domains/aliases differently by account/project; PotHub only displays domains actually returned by Vercel or a verified deployment URL.
- Large commits are split into sequential Git commits on one new branch. HTTP request and aggregate payload limits still apply; very large binary assets should be committed via Git LFS or GitHub's upload workflow rather than text patches.
- Media blobs and weekly reminder state stay in local IndexedDB; they are not added to Firestore. Existing account sync remains metadata-focused.
- This update does not claim live provider tests, Vercel deployment tests or Android device tests; these require the user's connected accounts and deployment environment.
- Fixed PDF attachment extraction order so PDFs use the PDF text extractor instead of being read as plain text; Creator chat now caps each attachment batch at eight supported files.
