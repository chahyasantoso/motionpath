import { describe, it, expect } from 'vitest';
import { StaticLayoutDelegate } from '../StaticLayoutDelegate.js';

describe('StaticLayoutDelegate', () => {
  const delegate = new StaticLayoutDelegate();

  describe('computeReflow', () => {
    it('always returns [] even when removing a mid-chain child', () => {
      const child0 = { currentDelay: 0 };
      const child1 = { currentDelay: 10 };
      const child2 = { currentDelay: 20 };
      const children = [child0, child1, child2];

      // Test rank-0 removal
      expect(delegate.computeReflow(children, child0)).toEqual([]);

      // Test mid-chain removal
      expect(delegate.computeReflow(children, child1)).toEqual([]);

      // Test end of chain removal
      expect(delegate.computeReflow(children, child2)).toEqual([]);
    });
  });

  describe('computeSpawnDelay', () => {
    it('behaves identically to GaplessLayoutDelegate (inherits spawn delay calculations)', () => {
      const children = [
        { currentDelay: 10 },
        { currentDelay: 25 }
      ];
      // Anchors to frontmost (25) + stagger (5) = 30
      expect(delegate.computeSpawnDelay(children, { stagger: 5 })).toBe(30);
    });
  });
});
