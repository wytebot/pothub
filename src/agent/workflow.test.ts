import { describe, expect, it } from 'vitest';
import { isEngineeringAgentRequest, autoRoutePreference } from './workflow';

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


describe('prompt-aware model routing', () => { it('prefers quality for code repair and deep research', () => { expect(autoRoutePreference('debug this production build')).toBe('quality'); expect(autoRoutePreference('deep research and verify this')).toBe('quality'); }); it('prefers speed for brief simple asks and respects fallback for neutral prompts', () => { expect(autoRoutePreference('quick definition')).toBe('speed'); expect(autoRoutePreference('hello', 'speed')).toBe('speed'); }); });
