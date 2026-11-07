// Chat <-> Termux protocol. The model asks for ONE command per reply with a fenced block:
//
//   ```pothub-run
//   cwd: ~/.pothub/workspaces/me__repo     (optional first line)
//   npm test
//   ```
//
// PotHub shows the command, waits for the person's approval, runs it in Termux with live output, then sends the
// result back as the next message. Pure functions only so they are unit-tested in Node.

export const RUN_FENCE = 'pothub-run';
const CLOSED = /```pothub-run[^\S\n]*\r?\n([\s\S]*?)\r?\n?```/gi;
const OPEN_TAIL = /```pothub-run[\s\S]*$/i;

/** First run request in a reply: { command, cwd, extra } or null. `extra` counts additional blocks that are ignored. */
export function extractRunRequest(text) {
  const blocks = [...String(text || '').matchAll(CLOSED)].map((m) => m[1]);
  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n');
    let cwd = '';
    const head = lines[0]?.match(/^\s*(?:cwd|dir|folder)\s*:\s*(.+?)\s*$/i);
    if (head) { cwd = head[1].replace(/^['"]|['"]$/g, ''); lines.shift(); }
    const command = lines.join('\n').replace(/\s+$/g, '').replace(/^\n+/, '');
    if (command.trim()) return { command, cwd, extra: blocks.length - 1 };
  }
  return null;
}

/** Remove run blocks from text shown as Markdown (the approval card shows the command instead). Hides half-streamed blocks too. */
export function stripRunBlocks(text) {
  return String(text || '').replace(CLOSED, '').replace(OPEN_TAIL, '').replace(/\n{3,}/g, '\n\n').trim();
}

const RISKY = [
  [/\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(-[a-z]+\s+)*(\/|~|\$HOME|\*|\.\.?)(\s|$|\/\*)/i, 'deletes files recursively'],
  [/\bmkfs\b|\bdd\s+[^|;]*\bof=\/dev\//i, 'writes to a disk device'],
  [/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:/, 'looks like a fork bomb'],
  [/\b(curl|wget)\b[^|;\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/i, 'pipes a download straight into a shell'],
  [/\bchmod\s+-R\s+[0-7]*7[0-7]*\s+(\/|~|\$HOME)/i, 'changes permissions recursively'],
  [/\b(shutdown|reboot|poweroff)\b/i, 'powers the device off'],
  [/\bgit\s+push\b[^\n]*(--force|-f\b)/i, 'force-pushes to a remote'],
];
/** Short reason if a command looks destructive (shown as a warning on the approval card), else ''. */
export function riskReason(command) {
  for (const [re, why] of RISKY) if (re.test(String(command || ''))) return why;
  return '';
}

const fenceFor = (text) => '`'.repeat(Math.max(3, ...[...String(text).matchAll(/`+/g)].map((m) => m[0].length + 1)));

/**
 * The message sent back to the model after a run. `maxChars` only bounds what goes into the model's context window;
 * the person still sees (and can save) the complete output on the card.
 */
export function formatRunResult({ command, cwd = '', state = '', exitCode = null, output = '', skipped = false, error = '', maxChars = 8000 } = {}) {
  const head = `TERMUX RESULT\nCommand: ${String(command || '').split('\n')[0].slice(0, 300)}${String(command || '').includes('\n') ? ' …' : ''}${cwd ? `\nFolder: ${cwd}` : ''}`;
  if (skipped) return `${head}\nThe user chose not to run this command. Do not assume it ran; ask what they would like instead.`;
  if (error) return `${head}\nThe command could not be run: ${String(error).slice(0, 400)}`;
  const text = String(output || '');
  const tail = text.length > maxChars ? text.slice(text.length - maxChars) : text;
  const note = text.length > maxChars ? `Output (last ${maxChars} of ${text.length} characters)` : 'Output';
  const status = state === 'stopped' ? 'stopped by the user' : state === 'lost' ? 'Termux ended the process unexpectedly' : exitCode === 0 ? 'succeeded' : 'failed';
  const fence = fenceFor(tail);
  return `${head}\nExit code: ${exitCode ?? 'unknown'} (${status})\n${note}:\n${fence}text\n${tail.replace(/\s+$/, '') || '(no output)'}\n${fence}`;
}
