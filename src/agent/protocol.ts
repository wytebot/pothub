/** The file-marker format the text model is asked to use when one answer holds several files. Parsed by bundle.ts. */
export const BUNDLE_PROTOCOL = [
  'Output every file in this exact format and nothing else outside it (one short sentence before the first file is allowed):',
  '=== FILE: path/to/file.ext ===',
  '(the complete file contents, no code fence around them)',
  '=== END FILE ===',
  'Use real relative paths with folders (src/App.tsx, public/index.html, docs/guide.pdf). Write every file completely: no placeholders, no "rest of the code here", no "...".',
  'Files ending in .pdf, .docx or .pptx are written as Markdown (# title, ## sections; for .pptx each # or ## heading is one slide) and MonyGist converts them to the real format. Files ending in .xlsx are written as CSV (first row = headers; start another sheet with a line "--- sheet: Name ---"). Every other file is written exactly as it should be saved.',
  'For a software project include everything needed to run it (package.json or equivalent, entry files, config, a README.md with run steps). Use .env.example with placeholder values for any keys, and never ask the person for an API key, model name or provider: pick sensible defaults, and only use an external service when the project truly cannot work without one.',
].join('\n');
