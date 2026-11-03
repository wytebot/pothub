# PotHub manual QA checklist

## Before preview deployment
- [ ] Optional cleanup: remove legacy platform-owned AI key variables from Vercel Production, Preview and Development. If left configured, they are ignored for inference and only produce a warning; startup must continue.
- [ ] Run `npm ci`, `npm run check`, and `npm run build` in the target Node 24 environment.
- [ ] Confirm `/api/health` returns ready and `GET /api/pricing` returns the approved pack amounts.

## Task routing
- [ ] Configure Chat only; ask for an image. Confirm no text model is called and the UI asks for an Image agent.
- [ ] Configure Image only; request an image and confirm a real image result is returned or a clean provider-specific error appears.
- [ ] Configure Video only; request video and confirm the video route uses that agent's own key/provider/model.
- [ ] Configure a Chat agent with a model unavailable to its key; verify the app reports a short actionable error and does not leak key/provider JSON.
- [ ] Add a legacy `all` agent and verify it is not used until reassigned to a specific task.
- [ ] Verify developer and creator workspaces separately; this pass does not yet provide server-authoritative agent scope isolation.

## Output and workspace
- [ ] Request code and confirm code block copy/download, ZIP and explicit commit-review flow.
- [ ] Request multiple formats in one prompt and document any capability that is not actually orchestrated yet.
- [ ] On Android Chrome, Capacitor WebView, iOS Safari and desktop, verify autocorrect, composer growth/shrink, Enter/Shift+Enter and keyboard avoidance.
- [ ] Refresh and background the app during media jobs; verify no duplicate credit settlement and no stuck status.

## Security and economics
- [ ] Search server logs, API responses, IndexedDB, cloud sync payloads and crash reports for raw provider keys.
- [ ] Test concurrent duplicate requests and failed-operation refunds.
- [ ] Run `npm run pricing:check`; all packs must meet the target plus buffer.
- [ ] Replace the infrastructure placeholder with measured invoice data and rerun the margin check.
