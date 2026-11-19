# Pothub 0.5.7 build corrections

- Removed unused `webWanted` import from `src/agent/workflow.ts`.
- Removed unused `webActive` import from `src/pages/Home.tsx`.
- Chat text runs now automatically attempt web search for every response, subject to the existing Free daily allowance and Premium entitlement.
- Added a pre-build cleanup script to delete the obsolete tracked `src/cloud/sync.ts` left in older Git commits. This does not remove local IndexedDB backup/restore.
- Build script runs cleanup before TypeScript so the stale `mediaIndex` import cannot block Vercel.

The search allowance remains plan-aware: Free users have the existing daily cap; Premium users remain unlimited. When Free quota is exhausted, the app clearly reports that no fresh search could be performed rather than claiming it searched.
