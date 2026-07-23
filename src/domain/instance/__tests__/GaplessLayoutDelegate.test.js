import { describe, it, expect } from 'vitest';
import { GaplessLayoutDelegate } from '../GaplessLayoutDelegate.js';

describe('GaplessLayoutDelegate', () => {
  const delegate = new GaplessLayoutDelegate();

  describe('computeSpawnDelay', () => {
    it('returns 0 when there are no children', () => {
      expect(delegate.computeSpawnDelay([], { stagger: 5 })).toBe(0);
    });

    it('returns frontmost child delay + stagger when there is one child', () => {
      const children = [{ currentDelay: 10 }];
      expect(delegate.computeSpawnDelay(children, { stagger: 5 })).toBe(15);
    });

    it('picks the maximum currentDelay among multiple children rather than last-inserted', () => {
      const children = [
        { currentDelay: 10 },
        { currentDelay: 25 },
        { currentDelay: 15 }
      ];
      expect(delegate.computeSpawnDelay(children, { stagger: 5 })).toBe(30);
    });
  });

  describe('computeReflow', () => {
    it('returns [] when removing the rank-0 (frontmost) child', () => {
      const children = [
        { currentDelay: 0 },
        { currentDelay: 10 },
        { currentDelay: 20 }
      ];
      const removed = children[0];
      expect(delegate.computeReflow(children, removed)).toEqual([]);
    });

    it('returns correct cascade pairs in rank order when removing a mid-chain child', () => {
      const child0 = { id: 'c0', currentDelay: 0 };
      const child1 = { id: 'c1', currentDelay: 10 };
      const child2 = { id: 'c2', currentDelay: 20 };
      const child3 = { id: 'c3', currentDelay: 30 };

      // We pass them out of order to ensure sorting logic in computeReflow works
      const children = [child2, child0, child3, child1];

      // Sort order: child0 (0), child1 (10), child2 (20), child3 (30)
      // Removing child1 (rank 1):
      // - child2 should move to child1's currentDelay (10)
      // - child3 should move to child2's original currentDelay (20)
      const result = delegate.computeReflow(children, child1);

      expect(result).toEqual([
        { child: child2, delay: 10 },
        { child: child3, delay: 20 }
      ]);
    });

    it('returns [] when removedChild is not in the children array', () => {
      const children = [
        { currentDelay: 0 },
        { currentDelay: 10 }
      ];
      const removed = { currentDelay: 5 };
      expect(delegate.computeReflow(children, removed)).toEqual([]);
    });
  });
});
