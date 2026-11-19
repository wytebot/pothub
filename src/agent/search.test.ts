import { describe, expect, it } from 'vitest';
import { shouldAutoWebSearch } from './search';

describe('automatic web research intent', () => {
  it('detects time-sensitive and externally changing questions', () => {
    for (const prompt of ['Who is the richest man today?', 'What is the latest Android version?', 'Current Tesla stock price', 'Nigeria news this week', 'Weather forecast right now']) {
      expect(shouldAutoWebSearch(prompt)).toBe(true);
    }
  });
  it('does not force web search for stable writing and creative requests', () => {
    for (const prompt of ['Write a birthday poem', 'Explain photosynthesis', 'Make this paragraph clearer']) {
      expect(shouldAutoWebSearch(prompt)).toBe(false);
    }
  });
});
