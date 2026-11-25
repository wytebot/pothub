import { describe, expect, it } from 'vitest';
import { auditSource, auditWorkspace } from './audit';

describe('offline source audit', () => {
  it('finds probable hard-coded API secrets and reports line numbers', () => {
    const findings = auditSource('src/config.ts', "const safe = 'placeholder';\nconst apiKey = 'sk-123456789012345678901234567890';");
    expect(findings.some(f => f.rule === 'secret-literal' && f.line === 2 && f.severity === 'high')).toBe(true);
  });
  it('finds dynamic execution and DOM injection', () => {
    const findings = auditSource('app.js', 'eval(input);\nelement.innerHTML = userInput;');
    expect(findings.map(f => f.rule)).toContain('dynamic-eval');
    expect(findings.map(f => f.rule)).toContain('html-injection');
  });
  it('audits a collection of workspace files', () => {
    expect(auditWorkspace({ 'a.js': 'TODO', 'b.js': 'ok' })).toHaveLength(1);
  });
});
