import { describe, expect, it } from 'vitest';
import { analyze, backlinkSnippet, safeLabel, type Page, type Site } from './siteDiagnosis';
const sample: Page = { url: 'https://example.test/page', title: 'A useful, descriptive example page title', text: Array.from({ length: 340 }, (_, i) => `Useful page content with topic words and an example reference https://example.test/${i}.`).join(' ') };
const site: Site = { id: '1', url: 'https://example.test/', label: 'Example site' };
describe('site diagnosis helpers', () => {
  it('creates a followed backlink snippet to Pothub without nofollow attributes', () => { const html = backlinkSnippet(site); expect(html).toContain('href="https://pothub-self.vercel.app/"'); expect(html).toContain('Example site uses Pothub'); expect(html).not.toMatch(/rel=["'][^"']*(?:nofollow|ugc|sponsored)/i); });
  it('sanitizes site labels for generated HTML attributes', () => { expect(safeLabel('  <Bad "label">  ')).toBe('Bad label'); });
  it('produces deterministic HTTPS and content checks', () => { const checks = analyze(sample); expect(checks.find(x => x.name === 'HTTPS')?.ok).toBe(true); expect(checks.find(x => x.name === 'Content depth')?.ok).toBe(true); expect(checks).toHaveLength(8); });
  it('flags HTTP and short content', () => { const checks = analyze({ url: 'http://example.test', title: '', text: '' }); expect(checks.find(x => x.name === 'HTTPS')?.ok).toBe(false); expect(checks.find(x => x.name === 'Readable content')?.ok).toBe(false); });
});
