export type AuditSeverity = 'high' | 'medium' | 'low';
export type AuditFinding = { severity: AuditSeverity; rule: string; message: string; line: number };

/** Lightweight offline heuristics. Findings are suggestions, not a replacement for a security tool. */
const rules: { severity: AuditSeverity; rule: string; pattern: RegExp; message: string }[] = [
  { severity: 'high', rule: 'secret-literal', pattern: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"](?!(?:YOUR_|REPLACE_|EXAMPLE|PLACEHOLDER))[^'"\s]{12,}['"]|(?:sk-[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[0-9A-Z]{16})/i, message: 'Possible hard-coded credential. Move it to a secret manager or environment variable and rotate it if real.' },
  { severity: 'high', rule: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, message: 'Private key material appears in source. Remove it and rotate/revoke the key.' },
  { severity: 'high', rule: 'dynamic-eval', pattern: /\b(?:eval\s*\(|new\s+Function\s*\()/, message: 'Dynamic code execution can run untrusted input. Avoid it or strictly constrain input.' },
  { severity: 'medium', rule: 'html-injection', pattern: /\.(?:innerHTML|outerHTML)\s*=/, message: 'Direct HTML injection may introduce XSS. Prefer textContent or sanitize trusted markup.' },
  { severity: 'medium', rule: 'shell-escape', pattern: /\b(?:exec|execSync|spawn|spawnSync)\s*\([^\n]{0,160}shell\s*:\s*true/, message: 'Shell execution with shell:true can enable command injection. Pass safe arguments without a shell.' },
  { severity: 'low', rule: 'insecure-http', pattern: /https?:\/\/[^\s'"`]+/i, message: 'Non-TLS HTTP URL found. Verify this is intentional; use HTTPS for production APIs.' },
  { severity: 'low', rule: 'todo-marker', pattern: /\b(?:TODO|FIXME|XXX)\b/, message: 'Unfinished work marker found. Confirm this is intentional before shipping.' },
];
export function auditSource(path: string, source: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const r of rules) if (r.pattern.test(line)) findings.push({ severity: r.severity, rule: r.rule, message: `${path}: ${r.message}`, line: i + 1 });
  }
  return findings;
}
export function auditWorkspace(files: Record<string, string>): AuditFinding[] {
  return Object.entries(files).flatMap(([path, source]) => auditSource(path, source)).sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - ({ high: 0, medium: 1, low: 2 }[b.severity]) || a.line - b.line));
}
