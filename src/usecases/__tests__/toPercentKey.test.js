import { describe, it, expect } from 'vitest';
import { toPercentKey } from '../toPercentKey.js';

describe('toPercentKey', () => {
  it('removes IEEE-754 noise from decimal progress', () => {
    expect(toPercentKey(0.29)).toBe('29%');
    expect(toPercentKey(0.1 + 0.19)).toBe('29%');
  });

  it('preserves useful fractional percent precision', () => {
    expect(toPercentKey(0.123456789)).toBe('12.345679%');
  });

  it('handles the canonical endpoints', () => {
    expect(toPercentKey(0)).toBe('0%');
    expect(toPercentKey(1)).toBe('100%');
  });
});
