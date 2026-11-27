// Turns a Vercel build log into the two things the Deployments page shows: the build steps and the error that stopped the build.
// Free of imports so it is cheap to test.

export interface LogLine { t: number; type: string; text: string }
export type StepState = 'done' | 'running' | 'failed' | 'pending';
export interface BuildStep { id: string; label: string; state: StepState; detail?: string }
export interface BuildError { summary: string; text: string; files: string[] }

const PHASES: { id: string; label: string; start: RegExp }[] = [
  { id: 'clone', label: 'Clone repository', start: /^Cloning (?:github|gitlab|bitbucket)/i },
  { id: 'install', label: 'Install dependencies', start: /Running ["“]?(?:install|npm install|yarn install|pnpm install)/i },
  { id: 'build', label: 'Build', start: /Running ["“]?(?:npm run build|yarn build|pnpm build|pnpm run build)|^> .+@[\w.\-]+ build\b|^> .*\bbuild$/i },
  { id: 'deploy', label: 'Deploy', start: /Build Completed|Deploying outputs|Uploading build outputs|Build Completed in|Completing\.\.\./i },
];

const READY = /^(?:ready|succeeded|success)$/i;
const FAILED = /^(?:error|failed|failure|canceled|cancelled)$/i;

/** Which phases the log shows, and how each ended. `state` is the deployment's own state (READY, ERROR, BUILDING…). */
export function buildSteps(lines: LogLine[], state: string): BuildStep[] {
  const seen = new Map<string, number>();
  lines.forEach((l, i) => { for (const p of PHASES) if (!seen.has(p.id) && p.start.test(l.text.trim())) seen.set(p.id, i); });
  const order = PHASES.filter((p) => seen.has(p.id));
  const failed = FAILED.test(state); const ready = READY.test(state);
  const steps: BuildStep[] = PHASES.map((p) => {
    const at = seen.get(p.id);
    if (at === undefined) return { id: p.id, label: p.label, state: ready ? 'done' as const : 'pending' as const };
    const next = order.find((o) => (seen.get(o.id) ?? -1) > at);
    if (next || ready) return { id: p.id, label: p.label, state: 'done' as const };
    return { id: p.id, label: p.label, state: failed ? 'failed' as const : 'running' as const };
  });
  if (failed && !steps.some((s) => s.state === 'failed')) { const firstPending = steps.find((s) => s.state === 'pending'); if (firstPending) firstPending.state = 'failed'; }
  // After the first failed step nothing else ran.
  let dead = false;
  for (const s of steps) { if (dead && s.state === 'done') s.state = 'pending'; if (s.state === 'failed') dead = true; }
  return steps;
}

const ERR_LINE = /error TS\d+|\berror\b.*:|^Error\b|npm (?:ERR!|error)|Failed to compile|Module not found|Cannot find module|Could not resolve|SyntaxError|ReferenceError|TypeError|exited with \d+|\[vite[^\]]*\].*(?:error|failed)|ELIFECYCLE|ERESOLVE|Build failed|✘|✕/i;
const NOISE = /npm warn|deprecated|^\s*$|up to date|looking for funding|npm fund|audit/i;
const PATH = /(?:^|[\s("'`])((?:\.{0,2}\/)?(?:[\w@.\-]+\/)*[\w@.\-]+\.(?:tsx?|jsx?|mjs|cjs|json|css|scss|html|vue|svelte|py|go|rs|ya?ml|toml|md))(?=[:(\s"'`)]|$)/g;

/** True for a log line that reports a failure (not npm noise). */
export const isErrorLine = (text: string): boolean => ERR_LINE.test(text) && !NOISE.test(text);

/** The first real failure in the log with its surrounding lines, and the repository files it names. */
export function extractError(lines: LogLine[]): BuildError | null {
  const texts = lines.flatMap((l) => l.text.split('\n')).map((s) => s.replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s/, '').trimEnd());
  const first = texts.findIndex((t) => ERR_LINE.test(t) && !NOISE.test(t));
  if (first < 0) return null;
  // Keep the first failure block plus the closing "exited with" line when there is one.
  const block = texts.slice(first, first + 14).filter((t) => t.trim());
  const closing = texts.slice(first + 14).find((t) => /exited with \d+|Command .* failed|Build failed/i.test(t));
  const text = [...block, ...(closing && !block.includes(closing) ? ['…', closing] : [])].join('\n').slice(0, 4000);
  const files = new Set<string>();
  for (const t of texts.slice(Math.max(0, first - 2), first + 40)) {
    for (const m of t.matchAll(PATH)) {
      const p = m[1].replace(/^\/vercel\/path\d+\//, '').replace(/^\.\//, '');
      if (!/^(?:node_modules|\.\.)\//.test(p) && !/^https?:/.test(p)) files.add(p);
    }
  }
  return { summary: texts[first].trim().slice(0, 220), text, files: [...files].slice(0, 12) };
}

/** The last lines of the log, for the analysis. */
export const logTail = (lines: LogLine[], max = 220): string => lines.flatMap((l) => l.text.split('\n')).filter((t) => t.trim() && !NOISE.test(t)).slice(-max).join('\n');

/** Maps a path named in the log (which may be relative to a sub-folder, or only a file name) to a real file in the repository. */
export function resolvePaths(named: string[], repoPaths: string[]): string[] {
  const out = new Set<string>(); const set = new Set(repoPaths);
  for (const n of named) {
    if (set.has(n)) { out.add(n); continue; }
    const hit = repoPaths.find((p) => p.endsWith(`/${n}`)) ?? (!n.includes('/') ? repoPaths.find((p) => p.split('/').pop() === n) : undefined);
    if (hit) out.add(hit);
  }
  return [...out];
}
