# Codelab implementation notes

This update adds a compact Codelab page and a server-authenticated GitHub repository creation endpoint with name, description, visibility, auto-init, and license template selection. It also changes repository-chat off-topic handling to return a friendly scope message without charging credits, instead of surfacing a generic request error.

## Important remaining work

- The five-free-project allowance and one-credit charge for additional projects are **not enforced yet**. They need a durable per-account project counter and an atomic server-side credit reservation tied to the successful create operation; the UI intentionally does not claim this is active.
- Daily free credits still use the existing daily grant mechanism and can accumulate in the shared balance. True 24-hour expiry requires tracking daily-grant lots separately from purchased/starter credits and expiring only unused daily lots through an atomic database transaction/RPC. This ZIP does not pretend that expiry is implemented.
- Chat export/download formats and the one-click ZIP-to-GitHub commit/share action are not yet wired end-to-end in this update.
- Live GitHub repository creation, OAuth scopes, Next.js production build, and deployed behavior require environment-backed testing.
