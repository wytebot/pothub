import { describe, expect, it } from 'vitest';
import { isEngineeringAgentRequest } from './workflow';

describe('engineering agent intent', () => {
  it('recognizes the explicit composer preset instruction', () => {
    expect(isEngineeringAgentRequest('Use Engineering Agent workflow. Inspect context, plan, implement, verify.')).toBe(true);
  });
  it('recognizes explicit agent mode requests', () => {
    expect(isEngineeringAgentRequest('Please use agent mode to repair the project.')).toBe(true);
  });
  it('does not activate for ordinary coding requests', () => {
    expect(isEngineeringAgentRequest('Please fix this TypeScript error.')).toBe(false);
  });
});
