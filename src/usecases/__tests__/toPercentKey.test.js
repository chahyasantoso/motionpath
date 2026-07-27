import { describe, it, expect } from 'vitest';
import { toPercentKey } from '../toPercentKey.js';

describe('toPercentKey', () => {
  it('removes floating-point noise from authored progress', () => {
    expect(toPercentKey(0.29)).toBe('29%');
    expect(toPercentKey(0.333333333)).toBe('33.3333333%');
  });

  it('produces identical keys for equivalent positions', () => {
    expect(toPercentKey(0.3)).toBe(toPercentKey(0.30000000000000004));
  });
});
