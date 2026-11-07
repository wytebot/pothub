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

// ---------------------------------------------------------------------------------------------------------------
// Fact checks. The model cannot see the phone, so (1) commands are linted against how Termux really behaves before the
// person approves them, and (2) a reply that claims a command ran or passed is checked against whether a TERMUX RESULT
// actually exists and what its exit code was.
// ---------------------------------------------------------------------------------------------------------------

const SECRET = /gh[pousr]_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|\b(?:sk|rk|pk|xai|gsk|pplx|r8|fw|hf)[-_][A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}/;
const LINTS = [
  [/(^|[;&|(]\s*|\n\s*)(sudo|su|doas)(\s|$)/, 'error', 'Termux has no root, so sudo/su will fail. Run the command without it.'],
  [/(^|[;&|(]\s*|\n\s*)apt(-get)?\s/, 'error', 'Termux uses pkg (or apt through pkg), not system apt. Use "pkg install -y <name>".'],
  [/(^|[;&|(]\s*|\n\s*)(systemctl|service|journalctl)\s/, 'error', 'Android has no systemd, so this command does not exist in Termux.'],
  [/(^|[;&|(]\s*|\n\s*)(nano|vim?|emacs|less|more|top|htop|man)(\s|$)/, 'warn', 'This opens an interactive program. PotHub cannot type into it, so it will hang until you press Stop.'],
  [/(^|[;&|(]\s*|\n\s*)(?:sh|bash)\s+-i\b|\bread\s+-p\b/, 'warn', 'This waits for keyboard input, which PotHub cannot provide.'],
  [/\bpkg\s+(install|upgrade|remove|uninstall)\b(?![^\n]*(\s-y\b|\s--yes\b))/, 'warn', 'pkg may stop to ask for confirmation. Add -y so it runs without a prompt.'],
  [/\bnpm\s+(init|create)\b(?![^\n]*(\s-y\b|\s--yes\b))/, 'warn', 'npm init/create asks questions. Add -y or pass the answers as flags.'],
  [/(^|[\s=;&|(])\/(usr|bin|sbin|etc|var|opt|lib|tmp|home|root)(\/|\s|$)/, 'warn', 'Plain Linux paths like /usr or /tmp do not exist in Termux. Use $PREFIX (…/files/usr), $TMPDIR or ~ instead.'],
  [/\bgit\s+(push|pull|fetch|clone)\b[^\n]*https:\/\/[^\s/@]+:[^\s@]+@/i, 'error', 'The command embeds credentials in a git URL. Never put tokens in commands.'],
];
/** Problems with a command that the model could not know about: [{ level: 'error'|'warn', message }]. */
export function lintCommand(command) {
  const text = String(command || ''), out = [];
  if (SECRET.test(text)) out.push({ level: 'error', message: 'The command contains something that looks like an API key or token. Do not run it; keys must not be pasted into commands.' });
  for (const [re, level, message] of LINTS) if (re.test(text)) out.push({ level, message });
  return out;
}

const CLAIM_RAN = /\b(?:i(?:'ve|\s+have)?\s+(?:just\s+)?(?:ran|run|executed|tested|built|installed|deployed)|i\s+(?:can\s+)?confirm(?:ed)?\s+(?:that\s+)?(?:it|the\s+(?:tests?|build|install)|everything)|(?:all\s+)?(?:the\s+)?(?:tests?|checks?|build|install(?:ation)?|lint)\s+(?:all\s+)?(?:passed|pass|succeeded|completed\s+successfully|ran\s+successfully)|exit\s+code\s+(?:is\s+|was\s+)?0\b|no\s+errors?\s+(?:were\s+)?(?:found|reported))\b/i;
const CLAIM_OK = /\b(?:passed|pass(?:es)?|succeeded|succeeds|successful(?:ly)?|work(?:s|ed)(?:\s+now)?|is\s+fixed|fixed\s+it|no\s+errors?)\b/i;
const exitOf = (resultText) => { const m = /^Exit code:\s*(\d+)/m.exec(String(resultText || '')); return m ? Number(m[1]) : null; };

/**
 * Compare a reply with the evidence. `userMessage` is the message the reply answers. Returns a short note to append to
 * the reply, or ''. Only strong, specific claims are flagged so ordinary explanations are never second-guessed.
 */
export function checkRunClaims(reply, userMessage = '') {
  const text = stripRunBlocks(reply);
  if (!text) return '';
  const answeringResult = /^TERMUX RESULT\b/.test(String(userMessage || ''));
  if (!answeringResult) {
    return CLAIM_RAN.test(text)
      ? '_Fact check: no command result exists for this reply, so any claim above that something ran, passed or built is unverified. Run it through the Termux card to confirm._'
      : '';
  }
  const code = exitOf(userMessage);
  if (/Termux ended the process unexpectedly|stopped by the user|could not be run|chose not to run/.test(String(userMessage)) && CLAIM_OK.test(text))
    return '_Fact check: the command did not finish normally, so a claim that it passed or worked is not supported by the result._';
  if (code != null && code !== 0 && (CLAIM_RAN.test(text) || CLAIM_OK.test(text)) && !/\b(?:fail(?:ed|s|ure)?|error|did\s+not|didn't|doesn't|not\s+(?:pass|work))\b/i.test(text))
    return `_Fact check: the Termux result shows exit code ${code} (failed), which does not match a claim of success above._`;
  return '';
}
