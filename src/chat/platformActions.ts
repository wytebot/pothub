/** Explicit, confirmation-first actions available from the chat composer. */
export type ChatAction =
  | { kind: 'github-variable'; name: string; value: string }
  | { kind: 'vercel-variable'; name: string; value: string }
  | { kind: 'github-workflow'; workflow: string; branch?: string }
  | { kind: 'github-runs' }
  | { kind: 'vercel-deployments' };

const cleanActionValue = (s: string) => s.trim().replace(/^(["'])|(["'])$/g, '').trim();

export function detectChatAction(prompt: string): ChatAction | null {
  const ghVar = prompt.match(/\b(?:set|add|update)\s+(?:a\s+)?github\s+(?:actions?\s+)?variable\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\bto\b)\s*([\s\S]+)/i);
  if (ghVar) return { kind: 'github-variable', name: ghVar[1], value: cleanActionValue(ghVar[2]) };
  const vcVar = prompt.match(/\b(?:set|add|update)\s+(?:a\s+)?vercel\s+(?:project\s+)?(?:environment\s+)?variable\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|\bto\b)\s*([\s\S]+)/i);
  if (vcVar) return { kind: 'vercel-variable', name: vcVar[1], value: cleanActionValue(vcVar[2]) };
  const workflow = prompt.match(/\b(?:run|trigger|dispatch)\s+(?:the\s+)?(?:github\s+)?workflow\s+([A-Za-z0-9_.-]+)(?:\s+(?:on|for)\s+(?:branch\s+)?([A-Za-z0-9_./-]+))?/i);
  if (workflow) return { kind: 'github-workflow', workflow: workflow[1], branch: workflow[2] };
  if (/\b(?:show|list|check|get)\s+(?:the\s+)?(?:latest\s+)?(?:github\s+)?(?:actions|workflow\s+runs)\b/i.test(prompt)) return { kind: 'github-runs' };
  if (/\b(?:show|list|check|get)\s+(?:the\s+)?(?:latest\s+)?vercel\s+deployments\b/i.test(prompt)) return { kind: 'vercel-deployments' };
  return null;
}
