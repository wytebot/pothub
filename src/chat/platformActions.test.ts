import { describe, expect, it } from 'vitest';
import { detectChatAction } from './platformActions';

describe('chat platform actions', () => {
  it('parses explicit variable writes and preserves names and values', () => {
    expect(detectChatAction('set GitHub variable BUILD_MODE=production')).toEqual({ kind: 'github-variable', name: 'BUILD_MODE', value: 'production' });
    expect(detectChatAction('set Vercel environment variable featureFlag to on')).toEqual({ kind: 'vercel-variable', name: 'featureFlag', value: 'on' });
  });
  it('parses workflow dispatch and platform status reads', () => {
    expect(detectChatAction('run workflow deploy.yml on branch release')).toEqual({ kind: 'github-workflow', workflow: 'deploy.yml', branch: 'release' });
    expect(detectChatAction('show GitHub workflow runs')).toEqual({ kind: 'github-runs' });
    expect(detectChatAction('list latest Vercel deployments')).toEqual({ kind: 'vercel-deployments' });
  });
  it('does not turn ordinary requests into platform actions', () => { expect(detectChatAction('Explain GitHub Actions and Vercel')).toBeNull(); });
});
