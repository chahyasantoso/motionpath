import { describe, it, expect } from "vitest";
import { StaticLayoutDelegate } from "../StaticLayoutDelegate.js";

describe("StaticLayoutDelegate", () => {
  const delegate = new StaticLayoutDelegate();

  describe("computeReflow", () => {
    it("always returns [] even when removing a mid-chain child", () => {
      const child0 = { currentOffset: 0 };
      const child1 = { currentOffset: 10 };
      const child2 = { currentOffset: 20 };
      const children = [child0, child1, child2];

      expect(delegate.computeReflow(children, child0)).toEqual([]); // rank 0
      expect(delegate.computeReflow(children, child1)).toEqual([]); // mid-chain
      expect(delegate.computeReflow(children, child2)).toEqual([]); // end of chain
    });
  });

  describe("computeSpawnOffset", () => {
    it("behaves identically to GaplessLayoutDelegate (inherits spawn offset calculation)", () => {
      const children = [{ currentOffset: 10 }, { currentOffset: 25 }];
      // Anchors to frontmost (25) + stagger (5) = 30
      expect(delegate.computeSpawnOffset(children, { stagger: 5 })).toBe(30);
    });
  });
});
