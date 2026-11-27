// Gives a chat message access to the repositories tagged in it: the repository's name and account, its file list,
// and the files the question points at. The material goes in as text files marked "=== path ===", which the chat already reads in parts when large.
import { github, getTree, readFile, type Repo } from './github';
import { IGNORED, CONFIG_FILES } from './imports';
import type { Attachment } from '../agent/attachments';
import type { Tag } from './tags';

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'what', 'why', 'how', 'can', 'you', 'please', 'fix', 'repo', 'repository', 'file', 'files', 'code', 'make', 'add', 'update', 'change', 'from', 'into', 'about', 'have', 'does', 'not', 'are', 'was', 'its', 'any', 'all', 'our', 'your', 'my', 'me', 'it', 'is', 'in', 'on', 'of', 'to', 'a', 'an']);
const PER_REPO = 150_000; const MAX_FILES = 40; const FILE_MAX = 80_000;

export interface Scored { path: string; score: number }
/** Ranks repository files by how much the question points at them (named paths first, then words that appear in the path). */
export function rankFiles(paths: string[], question: string): Scored[] {
  const q = question.toLowerCase();
  const words = [...new Set(q.split(/[^a-z0-9_]+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
  return paths.map((path) => {
    const p = path.toLowerCase(); const base = p.split('/').pop() ?? p; let score = 0;
    if (q.includes(p)) score += 100; else if (base.length > 3 && q.includes(base)) score += 60; else if (q.includes(base.replace(/\.[^.]+$/, '')) && base.replace(/\.[^.]+$/, '').length > 3) score += 25;
    for (const w of words) if (p.includes(w)) score += 4;
    if (/^readme\.md$/i.test(path)) score += 3;
    if (CONFIG_FILES.includes(path)) score += 3;
    if (/^src\/(?:main|app|index)\.[tj]sx?$/i.test(path)) score += 2;
    return { path, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.path.length - b.path.length);
}

const textFile = (name: string, text: string): Attachment => {
  const blob = new Blob([text], { type: 'text/plain' });
  return { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, name, mime: 'text/plain', size: blob.size, kind: 'text', blob };
};

export interface RepoContext { attachments: Attachment[]; label: string }

/** Reads each tagged repository (default branch) and returns one text file per repository plus the label to put in the message. */
export async function repoContext(token: string, tags: Tag[], question: string, signal?: AbortSignal): Promise<RepoContext> {
  const out: Attachment[] = [];
  for (const tag of tags.slice(0, 3)) {
    if (signal?.aborted) throw new Error('Cancelled.');
    const info = await github<Repo>(token, `/repos/${tag.repo}`);
    const branch=tag.branch||info.default_branch;
    const { tree, truncated } = await getTree(token, tag.repo, branch);
    const files = tree.filter((t) => !IGNORED.test(t.path) && (t.size ?? 0) <= FILE_MAX * 2);
    const listing = files.slice(0, 1200).map((t) => t.path).join('\n') + (files.length > 1200 ? `\n… ${files.length - 1200} more files` : '');
    const ranked = rankFiles(files.map((f) => f.path), question);
    // With no pointer in the question, send the orientation files only; with pointers, send what they point at.
    const orientation = ['README.md','package.json','tsconfig.json','vite.config.ts','next.config.js','next.config.ts','src/main.tsx','src/main.ts','src/App.tsx','app/page.tsx','src/app/page.tsx','.github/workflows/ci.yml','.github/workflows/build.yml'].filter((p) => files.some((f) => f.path === p));
    const fallback = orientation.map((path) => ({ path, score: 1 })).filter((p) => !ranked.some((r) => r.path === p.path));
    const picks = [...ranked, ...fallback].slice(0, MAX_FILES);
    let used = 0; const parts: string[] = [];
    const bodies = await Promise.all(picks.map(async (p) => ({ path: p.path, text: await readFile(token, tag.repo, p.path, branch) })));
    for (const b of bodies) {
      if (b.text === null) continue;
      const text = b.text.length > FILE_MAX ? `${b.text.slice(0, FILE_MAX)}\n… (file continues; ask about a specific part to read more)` : b.text;
      if (used + text.length > PER_REPO) continue;
      used += text.length; parts.push(`=== ${b.path} ===\n${text}`);
    }
    const head = `Repository: ${tag.repo}\nAccount: ${tag.repo.split('/')[0]}\nName: ${tag.repo.split('/')[1]}\nBranch: ${branch}${info.private ? '\nVisibility: private' : ''}${truncated ? '\nNote: GitHub listed only part of this large repository.' : ''}\nRead policy: The complete file listing is supplied; attached source files are prioritized by request relevance and project orientation. Only the attached prioritized files have been fetched; additional files require a follow-up repository read. `;
    out.push(textFile(`repo-${tag.repo.replace('/', '-')}.txt`, `${head}\n\n=== FILE LIST ===\n${listing}\n\n${parts.join('\n\n')}`));
  }
  return { attachments: out, label: `Repositories: ${tags.map((t) => `@${t.repo}`).join(', ')}` };
}
