import { describe, it, expect } from 'vitest';
import { stopSequenceRule } from '../stop-sequence.js';

describe('stop-sequence rule', () => {
  const track = (stops) => ({ keyframes: { opacity: { stops } } });

  it('accepts monotonic unique stops with endpoints', () => {
    expect(stopSequenceRule(track([
      { p: 0, v: 0 }, { p: 0.29, v: 0.5 }, { p: 1, v: 1 },
    ]), {}, {}, 'tracks[0]')).toEqual([]);
  });

  it('rejects duplicate positions', () => {
    const errors = stopSequenceRule(track([
      { p: 0, v: 0 }, { p: 0.5, v: 0.5 }, { p: 0.5, v: 1 }, { p: 1, v: 1 },
    ]), {}, {}, 'tracks[0]');
    expect(errors.some((e) => e.severity === 'error' && e.message.includes('Duplicate'))).toBe(true);
  });

  it('rejects unsorted positions', () => {
    const errors = stopSequenceRule(track([
      { p: 0, v: 0 }, { p: 0.8, v: 0.8 }, { p: 0.2, v: 0.2 }, { p: 1, v: 1 },
    ]), {}, {}, 'tracks[0]');
    expect(errors.some((e) => e.severity === 'error' && e.message.includes('monotonic'))).toBe(true);
  });

  it('warns when the proxy has no endpoint seed', () => {
    const errors = stopSequenceRule(track([{ p: 0.5, v: 1 }, { p: 0.75, v: 2 }]), {}, {}, 'tracks[0]');
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.severity === 'warning')).toBe(true);
  });
});
