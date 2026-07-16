# MotionInstance — Spawning & Reflow Architecture

This document outlines key findings, design decisions, and mechanics of child timeline spawning and reflow cascades implemented in `MotionInstance`.

---

## 🏗️ Core Spawning & Placement Logic

Rather than relying on a separate counter or fixed formulas (which drift over time under continuous churn), child spawning positions are derived dynamically from the actual position of the **frontmost child**:

```javascript
const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
const frontmostDelay = this.children.reduce((max, c) => Math.max(max, c.currentDelay ?? 0), -stagger);
const calculatedDelay = targetConfig.delay ?? (frontmostDelay + stagger);
```

### Key Advantages:
1. **Self-Resetting**: When `this.children` is empty, `frontmostDelay` defaults to `-stagger`, making `calculatedDelay` naturally resolve to `0` without manual reset bookkeeping.
2. **Drift Immunity**: Spawns are anchored to reality; if preceding items are removed and reflowed, subsequent spawns automatically attach precisely one stagger width behind the new frontmost child.

---

## 🔄 Reflow Cascade

When a child is removed from the middle of the chain, a reflow cascade is triggered to close the resulting gap.

```javascript
const ordered = [...this.children].sort((a, b) => (a.currentDelay ?? 0) - (b.currentDelay ?? 0));
const removedRank = ordered.indexOf(child);

// splice child and add to pending removals
this.children.splice(idx, 1);
this.#pendingRemovals.add(child);

const targets = [];
if (removedRank > 0) {
  for (let k = removedRank + 1; k < ordered.length; k++) {
    targets.push({ child: ordered[k], delay: ordered[k - 1].currentDelay ?? 0 });
  }
}
```

### Essential Rules & Findings:

#### 1. Eager Logical Timing
To prevent stale states during animations, target delays are eagerly written to `child.currentDelay = delay` **before** the GSAP tween is created in `#reflowSiblings`. 
- Deferring this assignment to `onComplete` would cause concurrent `addChild` calls to read stale, pre-reflow positions, creating gaps and causing timeline playhead desyncs (stuck/orphaned children).
- The GSAP tween smoothly handles the visual transition, while the engine's logical tracking reflects the new structure instantly.

#### 2. Frontmost (Rank 0) Exemption
Reflow cascades are **only** executed when removing a child from the middle or rear of the chain (`removedRank > 0`).
- Removing the leading ball (rank 0 / frontmost) does not leave a gap between balls—it simply leaves the space ahead of the chain empty.
- Shifting the chain forward when rank 0 finishes would instantly teleport every survivor earlier on the parent timeline. Since the parent playhead has already passed these times, this would cause survivors to instantly complete, creating an avalanche of instant completions and locking the queue.

---

## 🛠️ Diagnostics & Debugging

You can subscribe to `onChildChange` on a container instance to trace child placement and reflow states:

```javascript
const unsubscribe = containerInstance.onChildChange(() => {
  const activeChildren = containerInstance.children;
  const childDelays = activeChildren.map(c => c.currentDelay?.toFixed(3));
  console.log(`Active Count: ${activeChildren.length}, Delays: [${childDelays.join(', ')}]`);
});
```
