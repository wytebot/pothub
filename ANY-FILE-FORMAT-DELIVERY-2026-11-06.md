# Agents can deliver any requested file type (Creator chat)

Before: 18 formats were allowed, but ZIP/XLSX/PPTX usually failed because the model was never told how to lay out its reply, and ZIP needed a private `file=` fence convention.

Now
- Server (`server/output-format-prompts.js`, used by /api/agent/chat/stream): per-format layout instructions (zip = fenced blocks with `file=path`, xlsx = one Markdown table per sheet, pptx = `## Slide title` + bullets, json/csv/html/svg/code formats, Markdown for docx/pdf/rtf). `outputFormat` is now any 1-10 char extension instead of a fixed enum.
- Client (`src/lib/output-files.js`): builds PDF (existing writer), DOCX, XLSX, PPTX, ZIP, RTF, TSV, SVG and ~40 text/source formats (java, go, rs, kt, php, rb, toml, jsonl, srt, ics, ...). Unknown text extensions are delivered verbatim. ZIP names files from `file=`/`path=`/`lang:path`/a path line above a fence, else `file-N.ext`, else a single `response.md`; the old 2 MB per-file and 10 MB archive caps are gone. XLSX with no table becomes a one-column sheet.
- Intent (`src/lib/request-intent.js`, `intent-lexicon.js`): recognises the new formats (e.g. "write a java file", "export as tsv") without catching ordinary sentences.
- Binary media (png, jpg, mp3, mp4, exe, rar...) cannot be authored as text; the chat says so plainly (images/video still go to the Image and Video agents).
