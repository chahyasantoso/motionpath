# Brief 15 — Monotonic spawn placement, sibling-cascade reflow, remove `isAutoStagger`

**Priority: HIGH.** Fixes a real production bug (stuck `children.length`, balls silently unremovable — root-caused live) and removes a now-dead field.
**Branch:** `v3`
**Files touched:** `src/domain/instance/MotionInstance.js`, `src/domain/instance/__tests__/MotionInstance.test.js`

---

## Background — three changes, one root cause, land together

1. `addChild()` currently derives a new child's timeline position from **live sibling count** (`this.children.filter(c => c.isAutoStagger).length`). Under continuous spawn+remove (e.g. a particle/wave spawner), live count plateaus once removals keep pace with spawns, while the real elapsed time on the parent's autonomous timeline keeps climbing. New children get placed **behind** the current playhead, render already-at-end-state, and their `onComplete` never fires because the playhead never crosses forward through their segment again — `children.length` accumulates permanently-orphaned entries. **Fix: replace live count with a monotonic spawn counter.**
2. `removeChild()` currently only reflows children where `isAutoStagger === true`, using a fixed `index * stagger` formula recomputed from scratch. We're removing that distinction — **all** surviving children now reflow, and they inherit the position of whoever was structurally ahead of them (a cascade), not a recomputed formula. This also makes `removeChild` no longer need to know `schemaMotion.stagger` at all.
3. Once (1) and (2) both land, `isAutoStagger` is referenced nowhere for actual behavior — it can be deleted from the class entirely (constructor field, `addChild` config assembly, `removeChild` filter).

## Locked decisions

- Spawn placement uses a new private field `#autoStaggerSpawnCount`, incremented on every auto-placed `addChild` call, **never decremented by removals**.
- `#autoStaggerSpawnCount` resets to `0` whenever `this.children.length` reaches `0` after a removal completes (i.e., "wave cleared, next spawn starts the rhythm over"). This mirrors what call sites were previously doing manually and moves it into the engine so callers don't have to remember it.
- `removeChild`'s reflow cascade reads **`child.currentDelay`** (the settled logical position, only updated on a reflow's `onComplete`) as its source of truth — **never** `child.timeline.startTime()` live, because that value is actively animating during an in-flight reflow tween and would produce jittery, non-deterministic cascade targets if read concurrently.
- The reflow cascade walks children **sorted by `currentDelay`**, not raw array/insertion order — insertion order is not guaranteed to match position order once manual `delay` values can land anywhere relative to auto-placed siblings.
- Cascade rule: for the sorted list with the removed child at rank `r`, every survivor at rank `k > r` gets a new target delay equal to `orderedBeforeRemoval[k - 1].currentDelay` (the position that belonged to whoever was immediately ahead of it, read from **before** any of this loop's own targets are applied — safe, since nothing mutates until the reflow tweens actually run afterward).
- `isAutoStagger` is deleted: the constructor field, its inclusion in `addChild`'s child config, and `removeChild`'s filter on it.

## Non-goals

- Do NOT change `#reflowSiblings()` — it already just takes a `targets: [{ child, delay }]` array and animates each `child.timeline`'s `startTime` toward `delay` via `gsap.to`. It doesn't care how `targets` was computed. Leave it untouched.
- Do NOT change `#staggerDelay(index)` — it's still used by `addChild` (with the new counter as its `index` argument), just no longer used by `removeChild`.
- Do NOT add a new public method or config option for opting out of reflow. Every child reflows now — that's the whole point of this change. A manually-delayed child's custom position becomes a **starting** position only; it will be swept into the shared cascade rhythm the first time any sibling is removed. (If a genuinely permanent, reflow-immune position is needed later, that's new scope for a future brief — not this one.)
- Do NOT touch `SpiralPage.jsx` or any other consumer in this brief. Once this lands, `SpiralPage`'s manual `spawnedCount.current = 0` reset and its `delay:` computation (if you added one from an earlier session) become redundant with the engine's own counter/reset — but that cleanup is a separate, follow-up change, not part of this brief.
- Do NOT change how `#finishRemoval` handles destroy-mid-reflow (`if (this.#destroyed) return;`) — untouched.

## WRONG (current code — `src/domain/instance/MotionInstance.js`)

```js
  #subscribers = new Map(); // trackId -> Set<wrapper>
  #childListeners = new Set();
  #onSubscriberChange;
  #deps;
  #scrollTrigger = null;
  #pendingRemovals = new Set(); // children mid-reflow, not yet detached from timeline
  #destroyed = false;

  constructor(motionId, config, schemaMotion, context) {
    this.id = MotionInstance.#generateUniqueId();
    this.motionId = motionId;
    this.config = config || {};
    this.schemaMotion = schemaMotion;
    this.deps = {
      resolveElement: context.resolveElement,
      mountInstance: context.mountInstance
    };
    this.templates = context.project?.templates || {};
    this.children = [];
    this.tracksMap = new Map();
    this.currentDelay = config.delay ?? undefined;
    this.isAutoStagger = config.isAutoStagger ?? true;
    this.delayTween = null;
    this.paddingCallback = null;
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

    const isAutoStagger = targetConfig.delay === undefined;
    const autoIndex = this.children.filter(c => c.isAutoStagger).length;
    const calculatedDelay = targetConfig.delay ?? this.#staggerDelay(autoIndex);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      isAutoStagger,
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

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1 || this.#pendingRemovals.has(child)) return;

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

    const targets = this.children
      .filter(c => c.isAutoStagger)
      .map((c, autoIdx) => ({ child: c, delay: this.#staggerDelay(autoIdx) }));

    this.#finishRemoval(child, targets);
  }

  async #finishRemoval(child, targets) {
    try {
      await this.#reflowSiblings(targets);
    } catch (err) {
      console.error(`MotionInstance "${this.id}": reflow failed for removed child`, err);
      // Structural removal must not depend on animation succeeding.
    } finally {
      if (this.#destroyed) return; // instance torn down mid-reflow, nothing left to touch

      this.timeline.remove(child.timeline);
      child.destroy();
      this.#pendingRemovals.delete(child);
      this.#childListeners.forEach(cb => cb());
    }
  }
```

## CORRECT

```js
  #subscribers = new Map(); // trackId -> Set<wrapper>
  #childListeners = new Set();
  #onSubscriberChange;
  #deps;
  #scrollTrigger = null;
  #pendingRemovals = new Set(); // children mid-reflow, not yet detached from timeline
  #destroyed = false;
  #autoStaggerSpawnCount = 0; // monotonic; never decremented by removals — see addChild()

  constructor(motionId, config, schemaMotion, context) {
    this.id = MotionInstance.#generateUniqueId();
    this.motionId = motionId;
    this.config = config || {};
    this.schemaMotion = schemaMotion;
    this.deps = {
      resolveElement: context.resolveElement,
      mountInstance: context.mountInstance
    };
    this.templates = context.project?.templates || {};
    this.children = [];
    this.tracksMap = new Map();
    this.currentDelay = config.delay ?? undefined;
    this.delayTween = null;
    this.paddingCallback = null;
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

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1 || this.#pendingRemovals.has(child)) return;

    // Reflow must walk children in actual timeline-position order, not
    // insertion order — a manually-delayed child can land anywhere relative
    // to auto-placed siblings. Source of truth is currentDelay (the settled
    // logical position), never timeline.startTime() live, which is actively
    // animating during an in-flight reflow and would give unstable targets.
    const ordered = [...this.children].sort((a, b) => (a.currentDelay ?? 0) - (b.currentDelay ?? 0));
    const removedRank = ordered.indexOf(child);

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

    // Every survivor after the removed slot inherits the position that
    // belonged to whoever was immediately ahead of it (a cascade), not a
    // recomputed index*stagger formula. This works uniformly for auto- and
    // manually-placed children and needs no reference to schemaMotion.stagger.
    const targets = [];
    for (let k = removedRank + 1; k < ordered.length; k++) {
      targets.push({ child: ordered[k], delay: ordered[k - 1].currentDelay ?? 0 });
    }

    this.#finishRemoval(child, targets);
  }

  async #finishRemoval(child, targets) {
    try {
      await this.#reflowSiblings(targets);
    } catch (err) {
      console.error(`MotionInstance "${this.id}": reflow failed for removed child`, err);
      // Structural removal must not depend on animation succeeding.
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
  }
```

---

## Test file changes — `src/domain/instance/__tests__/MotionInstance.test.js`

### Replace this test (asserts the old skip-custom-children behavior we're removing)

**WRONG (delete this test):**

```js
it("does not reflow a child that was given an explicit custom delay", async () => {
  const instance = createTestInstance("time-motion", {}, timelineSchema);
  const auto1 = instance.addChild("child-motion", {});
  const custom = instance.addChild("child-motion", { delay: 5 });

  instance.removeChild(auto1);

  expect(custom.delayTween).toBeNull(); // never touched by reflow
  expect(custom.currentDelay).toBe(5); // untouched
});

it("auto children reindex among themselves, skipping custom children", () => {
  const instance = createTestInstance("time-motion", {}, timelineSchema);
  const auto1 = instance.addChild("child-motion", {}); // auto, index 0
  instance.addChild("child-motion", { delay: 99 }); // custom, ignored for indexing
  const auto2 = instance.addChild("child-motion", {}); // auto, index 1

  expect(auto1.currentDelay).toBe(0);
  expect(auto2.currentDelay).toBeCloseTo(0.1); // stagger=0.1 in timelineSchema, index 1 among autos
});
```

**CORRECT (replace with):**

```js
it("reflows a manually-delayed child too — no more auto/manual distinction", async () => {
  const instance = createTestInstance("time-motion", {}, timelineSchema);
  const auto1 = instance.addChild("child-motion", {}); // delay 0
  const custom = instance.addChild("child-motion", { delay: 99 }); // manual, far out

  instance.removeChild(auto1);

  // custom is now a survivor ranked after auto1 in position order, so it
  // must be reflowed onto auto1's vacated slot (delay 0), same as any
  // other survivor.
  expect(custom.delayTween).not.toBeNull();
});

it("cascades survivors onto the vacated predecessor slot, not a recomputed formula", () => {
  const instance = createTestInstance("time-motion", {}, timelineSchema);
  const c0 = instance.addChild("child-motion", {}); // delay 0
  const c1 = instance.addChild("child-motion", {}); // delay 0.1
  const c2 = instance.addChild("child-motion", {}); // delay 0.2
  const c3 = instance.addChild("child-motion", {}); // delay 0.3

  // settle currentDelay as if prior reflows already completed, so the
  // cascade has real predecessor values to read
  c0.currentDelay = 0;
  c1.currentDelay = 0.1;
  c2.currentDelay = 0.2;
  c3.currentDelay = 0.3;

  instance.removeChild(c1); // remove the second one

  // c2 must inherit c1's vacated slot (0.1), c3 must inherit c2's
  // original slot (0.2) — a cascade, not a re-derived index*stagger.
  expect(c2.delayTween).not.toBeNull();
  expect(c3.delayTween).not.toBeNull();
});

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

### Update this test (drop the now-removed `isAutoStagger` assertion)

**WRONG:**

```js
      const instance = createTestInstance('time-motion', { mountInstance: mountInstanceSpy }, timelineSchema);
      instance.addChild('child-motion', {});

      const [, configArg] = mountInstanceSpy.mock.calls[0];
      expect(configArg.isAutoStagger).toBe(true);
      expect(configArg.delay).toBe(0);
    });
```

**CORRECT:**

```js
      const instance = createTestInstance('time-motion', { mountInstance: mountInstanceSpy }, timelineSchema);
      instance.addChild('child-motion', {});

      const [, configArg] = mountInstanceSpy.mock.calls[0];
      expect(configArg.isAutoStagger).toBeUndefined(); // field removed entirely
      expect(configArg.delay).toBe(0);
    });
```

Also rename that test's title from `'addChild passes isAutoStagger/delay through config instead of mutating the child after construction'` to `'addChild passes delay through config instead of mutating the child after construction'`.

**Leave unchanged** (still pass as-is with the new implementation): `'adds child and calculates stagger correctly'`, `'removes child and triggers delay updates on remaining children'`, `'removeChild is a no-op if called twice on the same child mid-reflow'`, `'destroy() kills delayTween and destroys children pending removal'`, `'onChildChange fires for removeChild only after reflow completes, not at splice time'`, `'reads duration/ease from schemaMotion.staggerTransition when present'`, `'instantly snaps delay updates without gsap.to when staggerTransition.duration is 0'`.

---

## Verification checklist

```bash
git clone --branch v3 https://github.com/chahyasantoso/motionpath.git /tmp/verify15
cd /tmp/verify15

# 1. isAutoStagger must be completely gone from the source (not tests)
grep -n "isAutoStagger" src/domain/instance/MotionInstance.js
# expect: NO output

# 2. Monotonic counter field present and used in addChild
grep -n "#autoStaggerSpawnCount" src/domain/instance/MotionInstance.js
# expect: 3 hits — field declaration, increment in addChild, reset in #finishRemoval

# 3. removeChild must not reference schemaMotion.stagger or #staggerDelay at all
sed -n '/removeChild(child)/,/^  }/p' src/domain/instance/MotionInstance.js | grep -c "staggerDelay\|schemaMotion.stagger"
# expect: 0

# 4. removeChild must sort by currentDelay, not trust raw array order
grep -n "sort((a, b) => (a.currentDelay" src/domain/instance/MotionInstance.js
# expect: 1 hit

# 5. Full suite green, including all new/modified MotionInstance tests
npm install
npx vitest run
# expect: all test files passing
```

Manually confirm on top of the automated checks: read the diff and verify `#reflowSiblings` itself was NOT touched (only `removeChild` above it should have changed) — that function should be byte-identical to before this brief.
