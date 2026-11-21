import { describe, expect, it } from 'vitest';
import { shouldAutoWebSearch } from './search';

describe('smart web research intent', () => {
  it('searches for fresh, sourced, or explicitly researched prompts', () => {
    for (const prompt of ['Who is the richest man today?', 'What is the latest Android version?', 'Current Tesla stock price', 'Nigeria news this week', 'Weather forecast right now', 'Search the web for React compiler news', 'Give me sources for this claim']) expect(shouldAutoWebSearch(prompt)).toBe(true);
  });
  it('does not search for stable explanations, creative writing, or edits', () => {
    for (const prompt of ['Write a birthday poem', 'Explain photosynthesis', 'Make this paragraph clearer', 'Summarize this attached document', 'What is a closure in JavaScript?', 'Explain source code control']) expect(shouldAutoWebSearch(prompt)).toBe(false);
  });
});
