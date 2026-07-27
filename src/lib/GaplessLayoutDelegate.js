import { LayoutDelegate } from "./LayoutDelegate.js";

/**
 * Default layout policy: new children append after the frontmost existing
 * child (frontmost + stagger); removing a mid-chain child closes the gap by
 * cascading every subsequent sibling's currentOffset down by one slot.
 * Result after any removal: no gaps remain in the offset sequence — hence
 * "gapless".
 */
export class GaplessLayoutDelegate extends LayoutDelegate {
  computeSpawnOffset(children, { stagger = 0 } = {}) {
    // Placement is derived from actual current sibling state, not a formula
    // counted from a fixed origin — same principle computeReflow already
    // uses. A counter-based approach fixes live count plateauing under
    // churn, but goes stale the moment a reflow shifts the existing chain:
    // the counter has no way to know that happened, so every
    // removal-with-reflow before a spawn leaves a permanent extra
    // stagger-width gap between the old chain and everything spawned after
    // it. Anchoring to the real frontmost position is immune to both
    // failure modes at once, and needs no reset bookkeeping — an empty
    // children array naturally resolves to offset 0.
    const frontmostOffset = children.reduce(
      (max, c) => Math.max(max, c.currentOffset ?? 0),
      -stagger,
    );
    return frontmostOffset + stagger;
  }

  computeReflow(children, removedChild) {
    // Reflow must walk children in actual timeline-position order, not
    // insertion order — a manually-staggered child can land anywhere
    // relative to auto-placed siblings. Source of truth is currentOffset
    // (the settled logical position), never a live timeline position —
    // that's actively animating during an in-flight reflow and would give
    // unstable targets.
    const ordered = [...children].sort(
      (a, b) => (a.currentOffset ?? 0) - (b.currentOffset ?? 0),
    );
    const removedRank = ordered.indexOf(removedChild);

    // Cascade only when removing from the middle of the chain (rank > 0).
    // Removing the frontmost child (rank 0) never creates a gap — it's the
    // leading edge, and the next child naturally becomes the new leader.
    // Cascading rank 0 removals shifts all survivors' offsets earlier,
    // which can push children past completion and trigger an avalanche of
    // instant completions during natural drain.
    if (removedRank <= 0) return [];

    const targets = [];
    for (let k = removedRank + 1; k < ordered.length; k++) {
      targets.push({
        child: ordered[k],
        offset: ordered[k - 1].currentOffset ?? 0,
      });
    }
    return targets;
  }
}

// Stateless — one shared instance is safe across every Track.
export const defaultGaplessLayoutDelegate = new GaplessLayoutDelegate();
