import { describe, it, expect } from 'vitest';
import { applyAnchor } from '../helpers.js';

describe('applyAnchor', () => {
  it('should merge xPercent and yPercent into patch when anchor is provided', () => {
    const patch = { x: 100, y: 50 };
    const anchor = { xPercent: -50, yPercent: -50 };
    const result = applyAnchor(patch, anchor);

    expect(result).toEqual({ x: 100, y: 50, xPercent: -50, yPercent: -50 });
  });

  it('should return original patch unchanged when anchor is undefined', () => {
    const patch = { x: 100, y: 50 };
    const result = applyAnchor(patch, undefined);

    expect(result).toBe(patch);
  });
});
