import { describe, expect, it } from 'vitest';
import { shouldAutoWebSearch } from './search';

describe('mandatory web research policy', () => {
  it('attempts web research for every response, including stable and creative prompts', () => {
    for (const prompt of [
      'Who is the richest man today?',
      'What is the latest Android version?',
      'Current Tesla stock price',
      'Nigeria news this week',
      'Weather forecast right now',
      'Write a birthday poem',
      'Explain photosynthesis',
      'Make this paragraph clearer',
    ]) {
      expect(shouldAutoWebSearch(prompt)).toBe(true);
    }
  });
});
