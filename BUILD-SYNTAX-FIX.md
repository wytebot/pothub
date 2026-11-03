# PotHub build syntax fix

Fixed the Google redirect error message in `src/ui/App.jsx` to use a double-quoted JavaScript string. This avoids the unescaped apostrophe in `this site's` that caused the Next.js parser error reported by Vercel.

The Vercel log shows Next.js is now being detected and `npm run build` is running, so the earlier `vite: command not found` issue is resolved. This ZIP addresses the current parser error only; a fresh Vercel build is still required to discover any subsequent build issues.
