# Brief 16 — Fix cascade-drift gap in spawn placement

**Priority: HIGH.** Brief 15 fixed the original stuck-`children.length` bug, but its counter-based fix has a follow-on gap: it doesn't know when `removeChild`'s cascade has shifted the existing chain, so new spawns keep counting from a stale baseline. Reproduced live with exact numbers below.
**Branch:** `v3`
**Files touched:** `src/domain/instance/MotionInstance.js`, `src/domain/instance/__tests__/MotionInstance.test.js`

---

## The bug (confirmed by direct execution against the current code)

`addChild()` places new children at `#autoStaggerSpawnCount * stagger` — a fixed formula counted from origin zero. `removeChild()`'s cascade (from brief 15) correctly shifts survivors forward to close a gap when a sibling is removed — but that shift is invisible to the counter, which keeps counting as if the chain never moved.

Reproduced: 5 balls spawn evenly at delays `0, 0.1, 0.2, 0.3, 0.4` (stagger = 0.1). Removing ball index 2 correctly cascades survivors to `0, 0.1, 0.2, 0.3` — chain closes perfectly, no gap. But the next natural spawn, still driven by the counter (now at 5), lands at `5 × 0.1 = 0.5` — a full extra `0.1` gap versus the correct `0.4` (one clean stagger after the actual frontmost ball). **Every removal-with-reflow before a given spawn adds one more stagger-width of permanent dead space** between the reflowed chain and everything spawned after it. This is the visible gap in the Zuma spiral demo between the freshly-spawned cluster and the older chain below it.

## Locked decision

Delete the counter. Place new spawns relative to the **actual current position of the frontmost existing child** — the same "derive from observed sibling state, not a formula" principle brief 15 already applied to `removeChild`'s cascade, now applied symmetrically to `addChild`'s placement:

```js
const frontmostDelay = this.children.reduce(
  (max, c) => Math.max(max, c.currentDelay ?? 0),
  -stagger,
);
const calculatedDelay = targetConfig.delay ?? frontmostDelay + stagger;
```

When `this.children` is empty, `frontmostDelay` defaults to `-stagger`, so `calculatedDelay` naturally resolves to `0` — the "start fresh" case falls out for free, no separate reset bookkeeping required.

This is strictly better than the counter it replaces:

- Still immune to the original brief-15 bug (live count plateauing under churn) — this formula never counts alive children at all.
- Additionally immune to this new gap bug — a spawn always anchors to reality, so it automatically absorbs however much any number of prior reflows has shifted the chain.
- Simpler: no private counter field, no reset-on-empty logic needed anywhere.

## Non-goals

- Do NOT change `removeChild()`'s cascade logic — it's already correct and is exactly the pattern this brief extends to `addChild`. Leave it untouched.
- Do NOT change `#reflowSiblings()`.
- Do NOT add a config option to opt into counter-based placement. There should be exactly one placement mechanism.
- Do NOT touch any consumer (`SpiralPage.jsx` etc.) in this brief — that's separately scoped.

## WRONG (current code — `src/domain/instance/MotionInstance.js`)

```js
  #pendingRemovals = new Set(); // children mid-reflow, not yet detached from timeline
  #destroyed = false;
  #autoStaggerSpawnCount = 0; // monotonic; never decremented by removals — see addChild()
```

```js
  #staggerDelay(index) {
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    return index * stagger;
  }

  addChild(motionIdOrConfig, config) {
    if (this.#destroyed) {
      throw new Error(`addChild: instance "${this.id}" is destroyed.`);
    }

    let targetMotionId = this.motionId;
    let targetConfig = {};

    if (typeof motionIdOrConfig === 'string') {
      targetMotionId = motionIdOrConfig;
      targetConfig = config || {};
    } else if (typeof motionIdOrConfig === 'object') {
      targetConfig = motionIdOrConfig;
    }

    // Placement uses a monotonic spawn counter, not live sibling count.
    // Live count plateaus under continuous spawn+remove (removals keep pace
    // with spawns), which would place new children behind the parent
    // timeline's actual playhead — see brief 15 for the failure mode this
    // caused (stuck children.length, orphaned never-completing children).
    const calculatedDelay = targetConfig.delay ?? this.#staggerDelay(this.#autoStaggerSpawnCount++);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: this.id
    });

    this.children.push(child);

    // Native GSAP Nesting
    child.timeline.paused(false);
    child.timeline.delay(0);
    this.timeline.add(child.timeline, calculatedDelay);

    this.#childListeners.forEach(cb => cb());

    return child;
  }
```

```js
    } finally {
      if (this.#destroyed) return; // instance torn down mid-reflow, nothing left to touch

      this.timeline.remove(child.timeline);
      child.destroy();
      this.#pendingRemovals.delete(child);

      // Wave cleared — next spawn should restart the placement rhythm from 0
      // rather than keep climbing on top of a wave that's now fully gone.
      if (this.children.length === 0) {
        this.#autoStaggerSpawnCount = 0;
      }

      this.#childListeners.forEach(cb => cb());
    }
```

## CORRECT

```js
  #pendingRemovals = new Set(); // children mid-reflow, not yet detached from timeline
  #destroyed = false;
```

```js
  addChild(motionIdOrConfig, config) {
    if (this.#destroyed) {
      throw new Error(`addChild: instance "${this.id}" is destroyed.`);
    }

    let targetMotionId = this.motionId;
    let targetConfig = {};

    if (typeof motionIdOrConfig === 'string') {
      targetMotionId = motionIdOrConfig;
      targetConfig = config || {};
    } else if (typeof motionIdOrConfig === 'object') {
      targetConfig = motionIdOrConfig;
    }

    // Placement is derived from actual current sibling state, not a formula
    // counted from a fixed origin — same principle removeChild's cascade
    // already uses. A counter-based approach (tried in brief 15) fixes live
    // count plateauing under churn, but goes stale the moment removeChild's
    // cascade shifts the existing chain: the counter has no way to know that
    // happened, so every removal-with-reflow before a spawn leaves a
    // permanent extra stagger-width gap between the old chain and everything
    // spawned after it. Anchoring to the real frontmost position is immune
    // to both failure modes at once, and needs no reset bookkeeping — an
    // empty children array naturally resolves to delay 0.
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const frontmostDelay = this.children.reduce((max, c) => Math.max(max, c.currentDelay ?? 0), -stagger);
    const calculatedDelay = targetConfig.delay ?? (frontmostDelay + stagger);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: this.id
    });

    this.children.push(child);

    // Native GSAP Nesting
    child.timeline.paused(false);
    child.timeline.delay(0);
    this.timeline.add(child.timeline, calculatedDelay);

    this.#childListeners.forEach(cb => cb());

    return child;
  }
```

```js
    } finally {
      if (this.#destroyed) return; // instance torn down mid-reflow, nothing left to touch

      this.timeline.remove(child.timeline);
      child.destroy();
      this.#pendingRemovals.delete(child);

      this.#childListeners.forEach(cb => cb());
    }
```

---

## Test file changes — `src/domain/instance/__tests__/MotionInstance.test.js`

### Replace these two tests (reference the removed counter/its reset behavior)

**WRONG (delete both):**

```js
it("spawn placement uses a monotonic counter, immune to live-count plateauing under churn", () => {
  const instance = createTestInstance("time-motion", {}, timelineSchema);

  const a = instance.addChild("child-motion", {}); // spawn #0 -> delay 0
  expect(a.currentDelay).toBe(0);

  instance.removeChild(a); // live count drops back to 0, but spawn count must not reset mid-flight

  const b = instance.addChild("child-motion", {}); // spawn #1 -> delay 0.1, NOT 0
  expect(b.currentDelay).toBeCloseTo(0.1);
});

it("resets the spawn counter once all children have been removed", async () => {
  const schemaNoTransition = {
    ...timelineSchema,
    staggerTransition: { duration: 0 },
  };
  const instance = createTestInstance("time-motion", {}, schemaNoTransition);

  const a = instance.addChild("child-motion", {}); // spawn #0
  instance.removeChild(a);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(instance.children).toHaveLength(0);

  const b = instance.addChild("child-motion", {}); // wave cleared, should restart at 0
  expect(b.currentDelay).toBe(0);
});
```

**CORRECT (replace with):**

```js
it("restarts placement at 0 after all children have been removed", async () => {
  const schemaNoTransition = {
    ...timelineSchema,
    staggerTransition: { duration: 0 },
  };
  const instance = createTestInstance("time-motion", {}, schemaNoTransition);

  const a = instance.addChild("child-motion", {});
  instance.removeChild(a);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(instance.children).toHaveLength(0);

  const b = instance.addChild("child-motion", {});
  expect(b.currentDelay).toBe(0); // nothing left in the queue, fresh start — no reset bookkeeping needed
});

it("places a new spawn exactly one stagger after the reflowed chain, regardless of prior removals", () => {
  const instance = createTestInstance("time-motion", {}, timelineSchema);
  const c0 = instance.addChild("child-motion", {}); // delay 0
  const c1 = instance.addChild("child-motion", {}); // delay 0.1
  const c2 = instance.addChild("child-motion", {}); // delay 0.2
  const c3 = instance.addChild("child-motion", {}); // delay 0.3
  const c4 = instance.addChild("child-motion", {}); // delay 0.4

  instance.removeChild(c2); // triggers cascade: c3 -> 0.2, c4 -> 0.3

  // simulate the reflow having settled (what currentDelay becomes once
  // the tween's onComplete fires)
  c3.currentDelay = 0.2;
  c4.currentDelay = 0.3;

  const c5 = instance.addChild("child-motion", {});

  // must be 0.4 — one clean stagger after the reflowed frontmost (0.3).
  // A counter blind to the reflow would have produced 0.5 (brief 16's bug).
  expect(c5.currentDelay).toBeCloseTo(0.4);
  expect(c0.currentDelay).toBe(0); // untouched, unaffected by any of this
  expect(c1.currentDelay).toBe(0.1); // untouched
});
```

**Leave unchanged** (still pass as-is with the new implementation): `'adds child and calculates stagger correctly'`, `'removes child and triggers delay updates on remaining children'`, `'cascades survivors onto the vacated predecessor slot, not a recomputed formula'`, `'reflows a manually-delayed child too — no more auto/manual distinction'`, all of the `'Reflow and Deferred Removal API'` and `'Composition and Stagger API'` tests not listed above.

---

## Verification checklist

```bash
git clone --branch v3 https://github.com/chahyasantoso/motionpath.git /tmp/verify16
cd /tmp/verify16

# 1. Counter must be completely gone
grep -n "autoStaggerSpawnCount\|#staggerDelay" src/domain/instance/MotionInstance.js
# expect: NO output at all

# 2. New formula present, anchored to actual sibling state
grep -n "frontmostDelay = this.children.reduce" src/domain/instance/MotionInstance.js
# expect: 1 hit

# 3. No leftover reset-on-empty logic in #finishRemoval (no longer needed)
sed -n '/async #finishRemoval/,/^  }/p' src/domain/instance/MotionInstance.js | grep -c "autoStaggerSpawnCount"
# expect: 0

# 4. Full suite green
npm install
npx vitest run
# expect: all test files passing, including the new gap-regression test
```

**Do the live reproduction yourself, don't trust the unit test alone** — it's a pure function of `currentDelay`, but confirming it end-to-end catches wiring mistakes the unit test's manual `currentDelay` assignment could mask:

```js
// scratch.mjs, run with: node scratch.mjs
import { MotionInstance } from "./src/domain/instance/MotionInstance.js";
// ... construct an instance with a real childSchema (see brief 15's repro script for
// the full harness), spawn 5, remove index 2, wait for reflow's onComplete, spawn a
// 6th, and confirm its currentDelay is 0.4, not 0.5.
```
