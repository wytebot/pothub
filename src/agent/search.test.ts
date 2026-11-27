import { describe, expect, it } from 'vitest';
import { shouldAutoWebSearch, extractPromptUrls, consentedConfiguredSites } from './search';

describe('smart web research intent', () => {
  it('searches for fresh, sourced, or explicitly researched prompts', () => {
    for (const prompt of ['Who is the richest man today?', 'What is the latest Android version?', 'Current Tesla stock price', 'Nigeria news this week', 'Weather forecast right now', 'Search the web for React compiler news', 'Give me sources for this claim']) expect(shouldAutoWebSearch(prompt)).toBe(true);
  });
  it('does not search for stable explanations, creative writing, or edits', () => {
    for (const prompt of ['Write a birthday poem', 'Explain photosynthesis', 'Make this paragraph clearer', 'Summarize this attached document', 'What is a closure in JavaScript?', 'Explain source code control']) expect(shouldAutoWebSearch(prompt)).toBe(false);
  });
});

describe('web research for implementation requests', () => {
  it('searches for current implementation and debugging help', () => {
    for (const prompt of ['Fix my React app build error', 'Implement OAuth in my website', 'Upgrade Firebase integration in this app', 'Deploy my TypeScript backend']) expect(shouldAutoWebSearch(prompt)).toBe(true);
  });
  it('skips auto-search when code attachments or repo tags are present, and short commands are not queries', () => {
    expect(shouldAutoWebSearch('Fix my React app build error', { hasFiles: true })).toBe(false);
    expect(shouldAutoWebSearch('Fix my React app build error', { repoTagged: true })).toBe(false);
    expect(shouldAutoWebSearch('fix it')).toBe(false);
    expect(shouldAutoWebSearch('debug the code')).toBe(false);
  });
  it('does not research ordinary conversational or stable conceptual prompts', () => {
    for (const prompt of ['Tell me a joke', 'Explain photosynthesis', 'What is a closure in JavaScript?', 'Write a birthday poem']) expect(shouldAutoWebSearch(prompt)).toBe(false);
  });
});


describe('direct link extraction', () => {
  it('finds direct links in user prompts and strips trailing punctuation', () => { expect(extractPromptUrls('Read this deeply: https://example.com/article?x=1. And https://docs.example.org/a(b).')).toEqual(['https://example.com/article?x=1','https://docs.example.org/a(b)']);
  });
});


describe('consented configured website crawl access', () => {
  it('includes only verified, explicitly opted-in http(s) sites, deduplicates hosts, and bounds results', () => { const sites = [{url:'https://docs.example.com/',verified:true,crawl:true},{url:'https://docs.example.com/other',verified:true,crawl:true},{url:'https://no.example',verified:true,crawl:false},{url:'https://unverified.example',verified:false,crawl:true},{url:'javascript:alert(1)',verified:true,crawl:true},{url:'https://second.example',verified:true,crawl:true},{url:'https://third.example',verified:true,crawl:true}]; expect(consentedConfiguredSites(JSON.stringify(sites))).toEqual(['https://docs.example.com/','https://second.example']); });
  it('handles malformed storage without throwing', () => expect(consentedConfiguredSites('not json')).toEqual([]));
});
