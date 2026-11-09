// How the model must lay out its reply so the app can turn it into the requested file.
const MARKDOWN_DOCS = new Set(['docx', 'pdf', 'md', 'txt', 'rtf']);

export function outputFormatInstruction(format) {
  const f = String(format || '').toLowerCase();
  const lead = ` The user wants this answer as a downloadable .${f} file. PotHub builds that file from your reply, so write the complete file content now and keep any commentary to one short sentence outside it.`;
  if (f === 'zip') return `${lead} For a ZIP, put EVERY file in its own fenced block whose opening line is the language, a space, then file=relative/path.ext (for example \`\`\`js file=src/index.js). Give each file in full with no placeholders, include a README.md if useful, and use real folder paths.`;
  if (f === 'xlsx') return `${lead} For a spreadsheet, return each sheet as a Markdown table with a header row (one table per sheet, a short heading line above each) or as a \`\`\`csv block. Put one value per cell, numbers without currency symbols or thousands separators, and no merged cells.`;
  if (f === 'pptx') return `${lead} For a presentation, start each slide with a "## Slide title" line followed by 3-6 short bullet lines; keep one idea per slide and no tables.`;
  if (f === 'json') return `${lead} Return one valid JSON document in a single \`\`\`json block with no comments.`;
  if (f === 'jsonl') return `${lead} Return one valid JSON object per line in a single \`\`\`jsonl block.`;
  if (f === 'csv' || f === 'tsv') return `${lead} Return a single \`\`\`csv block or one Markdown table, with a header row.`;
  if (f === 'html' || f === 'htm') return `${lead} Return one complete HTML document in a single \`\`\`html block.`;
  if (f === 'svg') return `${lead} Return one complete SVG (with a viewBox) in a single \`\`\`svg block.`;
  if (MARKDOWN_DOCS.has(f)) return `${lead} Write it as clean Markdown (headings, lists, tables) with no preamble.`;
  return `${lead} Put the complete file in a single fenced block tagged with its language, with every import and dependency, no placeholders and no text inside the block that is not part of the file.`;
}
