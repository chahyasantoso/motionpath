import { GaplessLayoutDelegate } from './GaplessLayoutDelegate.js';

/**
 * Same spawn placement as GaplessLayoutDelegate (frontmost + stagger), but
 * removals never trigger a reflow — survivors keep their currentOffset
 * exactly as-is and the gap left by the removed child is never closed.
 *
 * Note: because computeSpawnOffset still anchors to frontmost currentOffset,
 * and currentOffset values never decrease under this delegate, the parent's
 * used span grows monotonically with total spawns over the session — it
 * does not shrink back down as children are removed. This is correct for
 * "items stay where they visually landed" use cases and wrong for
 * long-running high-churn ones; see GaplessLayoutDelegate for the
 * bounded-span alternative.
 */
export class StaticLayoutDelegate extends GaplessLayoutDelegate {
  computeReflow(children, removedChild) {
    return [];
  }
}

export const defaultStaticLayoutDelegate = new StaticLayoutDelegate();
