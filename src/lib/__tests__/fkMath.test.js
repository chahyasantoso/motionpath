import { describe, it, expect } from 'vitest';
import { composeWorld } from '../fkMath.js';

describe('composeWorld', () => {
  it('translates in the parent frame when parent has no rotation', () => {
    const out = composeWorld({ x: 10, y: 5, rotation: 0 }, { x: 80, y: 0, rotation: 0 });
    expect(out.x).toBeCloseTo(90);
    expect(out.y).toBeCloseTo(5);
    expect(out.rotation).toBe(0);
  });

  it('rotates the local offset into a rotated parent frame', () => {
    // parent rotated 90deg: local +x maps to +y
    const out = composeWorld({ x: 0, y: 0, rotation: 90 }, { x: 80, y: 0, rotation: 0 });
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(80);
  });

  it('accumulates rotation additively', () => {
    const out = composeWorld({ x: 0, y: 0, rotation: 30 }, { x: 0, y: 0, rotation: 15 });
    expect(out.rotation).toBe(45);
  });
});
