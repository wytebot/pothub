# Update 2026-11-08: agents read all repository code without tagging

Problem: with no @file tag the agent only got up to 8 files guessed from word overlap, the outline was cut at 14,000 characters (files beyond it were invisible and unrequestable), a read request was limited to 10 named files, and there was no way to find code by content.

Now, for repo chats:
1. **Starter files with no tag**: when a message names no file and nothing is carried over, PotHub attaches the project's key source files itself (entry points, configs, README, files whose names match the request; up to 14 files / 150k chars, files over 60k chars skipped). Test files, docs, noise and secrets are excluded.
2. **Full outline**: 60,000-character budget; folders beyond it are still listed with a file count and can be read with `folder/`.
3. **Folder reads**: a `pothub-read` line ending in `/` (or `/*`) reads every readable file under that folder; 20 files per request, up to 10 rounds per answer (was 6).
4. **Search all files**: new `pothub-search` block. PotHub scans every readable file (cached for 5 minutes, up to 450 files, 300k chars each) and returns `path:line` matches as an attachment, then the agent reads what matters. The blocks are hidden from the visible reply.
5. **Agent instructions** updated: read or search first for code questions, never ask the user to tag files.

Files: src/lib/repo-mentions.js, src/lib/repo-files.js, src/ui/App.jsx, tests/repo-mentions.test.mjs
Tests: tests/repo-mentions.test.mjs 18/18. Whole suite has the same 18 failures as before this change (none new).
