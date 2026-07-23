import { describe, it, expect } from 'vitest';
import { GaplessLayoutDelegate } from '../GaplessLayoutDelegate.js';

describe('GaplessLayoutDelegate', () => {
  const delegate = new GaplessLayoutDelegate();

  describe('computeSpawnOffset', () => {
    it('returns 0 when there are no children', () => {
      expect(delegate.computeSpawnOffset([], { stagger: 5 })).toBe(0);
    });

    it('returns frontmost child offset + stagger when there is one child', () => {
      const children = [{ currentOffset: 10 }];
      expect(delegate.computeSpawnOffset(children, { stagger: 5 })).toBe(15);
    });

    it('picks the maximum currentOffset among multiple children rather than last-inserted', () => {
      const children = [
        { currentOffset: 10 },
        { currentOffset: 25 },
        { currentOffset: 15 }
      ];
      expect(delegate.computeSpawnOffset(children, { stagger: 5 })).toBe(30);
    });
  });

  describe('computeReflow', () => {
    it('returns [] when removing the rank-0 (frontmost) child', () => {
      const children = [
        { currentOffset: 0 },
        { currentOffset: 10 },
        { currentOffset: 20 }
      ];
      const removed = children[0];
      expect(delegate.computeReflow(children, removed)).toEqual([]);
    });

    it('returns correct cascade pairs in rank order when removing a mid-chain child', () => {
      const child0 = { id: 'c0', currentOffset: 0 };
      const child1 = { id: 'c1', currentOffset: 10 };
      const child2 = { id: 'c2', currentOffset: 20 };
      const child3 = { id: 'c3', currentOffset: 30 };

      // Passed out of order to ensure the delegate's own sorting logic works
      const children = [child2, child0, child3, child1];

      // Sort order: child0 (0), child1 (10), child2 (20), child3 (30)
      // Removing child1 (rank 1):
      // - child2 should move to child1's currentOffset (10)
      // - child3 should move to child2's original currentOffset (20)
      const result = delegate.computeReflow(children, child1);

      expect(result).toEqual([
        { child: child2, offset: 10 },
        { child: child3, offset: 20 }
      ]);
    });

    it('returns [] when removedChild is not in the children array', () => {
      const children = [
        { currentOffset: 0 },
        { currentOffset: 10 }
      ];
      const removed = { currentOffset: 5 };
      expect(delegate.computeReflow(children, removed)).toEqual([]);
    });
  });
});
