# PotHub workspace crash fix

## Cause
`src/ui/WorkspaceSection.jsx` called `modelsForFunction(...)` and referenced `DEFAULT_MODELS` while configuring missing agents, but did not import either identifier. This caused a browser-side `ReferenceError` during workspace render, preventing the `#app:workspace` route from rendering after sign-in/return.

## Change
Added the missing imports from `../lib/provider-registry`:

`import {modelsForFunction,DEFAULT_MODELS} from '../lib/provider-registry';`

## Verification
Source-level reference/import check performed. A full Next.js production build was not run in this environment because project dependencies are not installed here. Deploy and verify GitHub sign-in plus workspace navigation on the live Vercel deployment.
