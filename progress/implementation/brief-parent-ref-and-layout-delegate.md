# Brief: `parent` reference + pluggable `LayoutDelegate` for MotionInstance

**File to edit:** `src/domain/instance/MotionInstance.js`
**New files to create:**

- `src/domain/instance/LayoutDelegate.js`
- `src/domain/instance/GaplessLayoutDelegate.js`
- `src/domain/instance/StaticLayoutDelegate.js`

**Tests to edit/create:**

- `src/domain/instance/__tests__/MotionInstance.test.js`
- `src/domain/instance/__tests__/GaplessLayoutDelegate.test.js` (new)
- `src/domain/instance/__tests__/StaticLayoutDelegate.test.js` (new)

Read the whole current `MotionInstance.js` before starting. Every WRONG/CORRECT
pair below is copied verbatim from the current file so you can locate it
exactly. Do not guess at surrounding code.

---

## Locked decisions (do not relitigate)

1. `parent` is **read-only from the outside**. Public getter, private field.
   Set internally by `addChild` (private-field cross-instance write — legal
   in JS since `#parent` is scoped to the class, not the instance). No public
   setter method of any kind.
2. `#parent` is cleared to `null` **inside `destroy()`, on `this`**, as the
   last step of that instance's own teardown. Nothing ever reaches into
   another instance to null out its `#parent` — each instance clears its own.
3. This refactor is a **behavior-preserving extraction**, not a redesign.
   `GaplessLayoutDelegate`'s `computeSpawnDelay`/`computeReflow` must produce
   byte-identical decisions to the current inline logic in `addChild` /
   `removeChild` for every existing test case. If any existing
   `MotionInstance.test.js` reflow/spawn test fails after this change, that
   is a regression, not an acceptable behavior change.
4. Base class is named `LayoutDelegate` (not `ReflowLayoutDelegate` —
   rejected name, see non-goals). Default gap-closing implementation is
   `GaplessLayoutDelegate` (not `GapLayoutDelegate` — renamed to describe the
   _result_: no gaps remain after reflow).
5. `StaticLayoutDelegate extends GaplessLayoutDelegate`, overriding only
   `computeReflow` to always return `[]`. It inherits `computeSpawnDelay`
   unchanged — spawn placement (frontmost + stagger) is identical between the
   two; only reflow-on-removal differs.
6. `computeReflow(children, removedChild, context)` **must be called before**
   `this.children` is spliced — `children` passed in still includes
   `removedChild`, exactly matching how `ordered` is built today.
7. Delegate selection: `context.layoutDelegate ?? config.layoutDelegate ??
defaultGaplessLayoutDelegate` (a shared singleton export of
   `GaplessLayoutDelegate`, since it is stateless). No schema field, no
   registry, no factory — this is a plain constructor-injected default.

## Non-goals — do not build these

- Do **not** name the base class `ReflowLayoutDelegate`. `StaticLayoutDelegate`
  never reflows anything, so a "reflow" name on the base contract is wrong.
  The method stays named `computeReflow` (a valid answer to that method can be
  "no reflow needed," returning `[]`) — only the _class_ name changes.
- Do **not** add a `dispose()`/teardown lifecycle hook to `LayoutDelegate`.
  Not needed by either shipped delegate.
- Do **not** add a schema-level field (e.g. `driver.layout`) to select a
  delegate by name. Selection is constructor-injection only in this brief.
- Do **not** build a `PoolingLayoutDelegate` or any slot-reuse logic. Out of
  scope for this brief entirely.
- Do **not** change `#reflowSiblings` or `#finishRemoval`. They keep consuming
  a `targets` array exactly as today — they don't know or care that it now
  comes from a delegate instead of being computed inline.
- Do **not** add a public setter for `parent` (e.g. `setParent()`). The only
  writer is `addChild`, via direct private-field access.
- Do **not** touch `child.currentDelay` initialization logic inside
  `#reflowSiblings` — that stays exactly as-is.

---

## Change 1 — private fields: add `#parent`

**WRONG (current):**

```js
  #subscribers = new Map(); // trackId -> Set<wrapper>
  #childListeners = new Set();
  #onSubscriberChange;
  #deps;
  #scrollTrigger = null;
  #pendingRemovals = new Set(); // children mid-reflow, not yet detached from timeline
  #destroyed = false;
```

**CORRECT:**

```js
  #subscribers = new Map(); // trackId -> Set<wrapper>
  #childListeners = new Set();
  #onSubscriberChange;
  #deps;
  #scrollTrigger = null;
  #pendingRemovals = new Set(); // children mid-reflow, not yet detached from timeline
  #destroyed = false;
  #parent = null; // public-read via getter, set only internally by addChild
```

## Change 2 — add the `parent` getter

Add this as a new method, anywhere among the other getters near the bottom of
the class (next to `requiredTriggerIds` / `isDestroyed` is fine):

```js
  get parent() {
    return this.#parent;
  }
```

## Change 3 — set `layoutDelegate` in constructor

**WRONG (current):**

```js
this.children = [];
this.tracksMap = new Map();
this.currentDelay = config.delay ?? undefined;
this.delayTween = null;
this.paddingCallback = null;

this.#deps = this.deps;
this.#onSubscriberChange = context.onSubscriberChange;
```

**CORRECT:**

```js
this.children = [];
this.tracksMap = new Map();
this.currentDelay = config.delay ?? undefined;
this.delayTween = null;
this.paddingCallback = null;
this.layoutDelegate =
  context.layoutDelegate ??
  config.layoutDelegate ??
  defaultGaplessLayoutDelegate;

this.#deps = this.deps;
this.#onSubscriberChange = context.onSubscriberChange;
```

Add the import at the top of the file, with the other imports:

```js
import { defaultGaplessLayoutDelegate } from "./GaplessLayoutDelegate.js";
```

## Change 4 — `addChild`: set `parent`, delegate spawn placement

**WRONG (current):**

```js
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
const stagger =
  this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
const frontmostDelay = this.children.reduce(
  (max, c) => Math.max(max, c.currentDelay ?? 0),
  -stagger,
);
const calculatedDelay = targetConfig.delay ?? frontmostDelay + stagger;

const child = this.#deps.mountInstance(targetMotionId, {
  ...targetConfig,
  delay: calculatedDelay,
  parentId: this.id,
});

this.children.push(child);
```

**CORRECT:**

```js
// Placement math is delegated to this.layoutDelegate (default:
// GaplessLayoutDelegate) rather than hardcoded here. See
// LayoutDelegate.js for the contract and why the "frontmost + stagger"
// reasoning below now lives in GaplessLayoutDelegate.computeSpawnDelay
// instead of inline.
const stagger =
  this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
const calculatedDelay =
  targetConfig.delay ??
  this.layoutDelegate.computeSpawnDelay(this.children, {
    stagger,
    schemaMotion: this.schemaMotion,
  });

const child = this.#deps.mountInstance(targetMotionId, {
  ...targetConfig,
  delay: calculatedDelay,
  parentId: this.id,
});

child.#parent = this;
this.children.push(child);
```

Note the comment explaining the frontmost-vs-counter reasoning **moves into
`GaplessLayoutDelegate.js`** (Change 6 below) — do not just delete it, relocate
it so the "why" isn't lost.

## Change 5 — `removeChild`: delegate reflow computation

**WRONG (current):**

```js
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

    // Cascade only when removing from the middle of the chain (rank > 0).
    // Removing the frontmost child (rank 0) never creates a gap — it's the
    // leading edge, and the next child naturally becomes the new leader.
    // Cascading rank 0 removals shifts all survivors' startTimes earlier on
    // the parent timeline, which can push children past completion and
    // trigger an avalanche of instant completions during natural drain.
    const targets = [];
    if (removedRank > 0) {
      for (let k = removedRank + 1; k < ordered.length; k++) {
        targets.push({ child: ordered[k], delay: ordered[k - 1].currentDelay ?? 0 });
      }
    }

    this.#finishRemoval(child, targets);
  }
```

**CORRECT:**

```js
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1 || this.#pendingRemovals.has(child)) return;

    // Delegate computes the reflow plan while `child` is still present in
    // this.children (matches the contract: computeReflow receives the full
    // live set INCLUDING the removed child, so it can determine rank). See
    // LayoutDelegate.js for the contract and GaplessLayoutDelegate.js for
    // the rank/ordering reasoning that used to live inline here.
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const targets = this.layoutDelegate.computeReflow(
      this.children, child, { stagger, schemaMotion: this.schemaMotion }
    );

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

    this.#finishRemoval(child, targets);
  }
```

Note the comments explaining ordering-by-`currentDelay` and the rank-0 skip
**move into `GaplessLayoutDelegate.js`** (Change 6) — relocate, don't delete.

## Change 6 — new file `LayoutDelegate.js`

```js
/**
 * @class LayoutDelegate
 *
 * Contract for pluggable child-placement policy on MotionInstance
 * composition (addChild/removeChild). Implementations decide WHERE a new
 * child goes (computeSpawnDelay) and WHETHER/HOW removal triggers a reflow
 * of surviving siblings (computeReflow). MotionInstance owns the mechanics
 * (GSAP nesting, tween execution via #reflowSiblings, teardown) — the
 * delegate only returns numbers/plans, it never touches a timeline.
 *
 * Implementations may be stateless (safe to share one instance across every
 * MotionInstance — see defaultGaplessLayoutDelegate) or stateful (e.g. a
 * hypothetical slot-pooling delegate tracking freed positions for reuse).
 * Stateful implementations must be constructed per-parent-instance, never
 * shared — computeReflow is not guaranteed to be side-effect-free.
 */
export class LayoutDelegate {
  /**
   * @param {MotionInstance[]} children - live children BEFORE the new one is added
   * @param {{ stagger: number, schemaMotion: object }} context
   * @returns {number} delay for the new child
   */
  computeSpawnDelay(children, context) {
    throw new Error("LayoutDelegate.computeSpawnDelay not implemented");
  }

  /**
   * @param {MotionInstance[]} children - live children INCLUDING removedChild (pre-splice)
   * @param {MotionInstance} removedChild
   * @param {{ stagger: number, schemaMotion: object }} context
   * @returns {{ child: MotionInstance, delay: number }[]} reflow targets, [] if none
   */
  computeReflow(children, removedChild, context) {
    throw new Error("LayoutDelegate.computeReflow not implemented");
  }
}
```

## Change 7 — new file `GaplessLayoutDelegate.js`

This is a **lossless extraction** — the logic and its reasoning comments come
directly from the WRONG blocks in Changes 4 and 5 above, just relocated.

```js
import { LayoutDelegate } from "./LayoutDelegate.js";

/**
 * Default layout policy: new children append after the frontmost existing
 * child (frontmost + stagger); removing a mid-chain child closes the gap by
 * cascading every subsequent sibling's currentDelay down by one slot. Result
 * after any removal: no gaps remain in the delay sequence — hence "gapless".
 */
export class GaplessLayoutDelegate extends LayoutDelegate {
  computeSpawnDelay(children, { stagger = 0 } = {}) {
    // Placement is derived from actual current sibling state, not a formula
    // counted from a fixed origin — same principle computeReflow already
    // uses. A counter-based approach fixes live count plateauing under
    // churn, but goes stale the moment a reflow shifts the existing chain:
    // the counter has no way to know that happened, so every
    // removal-with-reflow before a spawn leaves a permanent extra
    // stagger-width gap between the old chain and everything spawned after
    // it. Anchoring to the real frontmost position is immune to both
    // failure modes at once, and needs no reset bookkeeping — an empty
    // children array naturally resolves to delay 0.
    const frontmostDelay = children.reduce(
      (max, c) => Math.max(max, c.currentDelay ?? 0),
      -stagger,
    );
    return frontmostDelay + stagger;
  }

  computeReflow(children, removedChild) {
    // Reflow must walk children in actual timeline-position order, not
    // insertion order — a manually-delayed child can land anywhere relative
    // to auto-placed siblings. Source of truth is currentDelay (the settled
    // logical position), never timeline.startTime() live, which is actively
    // animating during an in-flight reflow and would give unstable targets.
    const ordered = [...children].sort(
      (a, b) => (a.currentDelay ?? 0) - (b.currentDelay ?? 0),
    );
    const removedRank = ordered.indexOf(removedChild);

    // Cascade only when removing from the middle of the chain (rank > 0).
    // Removing the frontmost child (rank 0) never creates a gap — it's the
    // leading edge, and the next child naturally becomes the new leader.
    // Cascading rank 0 removals shifts all survivors' startTimes earlier on
    // the parent timeline, which can push children past completion and
    // trigger an avalanche of instant completions during natural drain.
    if (removedRank <= 0) return [];

    const targets = [];
    for (let k = removedRank + 1; k < ordered.length; k++) {
      targets.push({
        child: ordered[k],
        delay: ordered[k - 1].currentDelay ?? 0,
      });
    }
    return targets;
  }
}

// Stateless — one shared instance is safe across every MotionInstance.
export const defaultGaplessLayoutDelegate = new GaplessLayoutDelegate();
```

## Change 8 — new file `StaticLayoutDelegate.js`

```js
import { GaplessLayoutDelegate } from "./GaplessLayoutDelegate.js";

/**
 * Same spawn placement as GaplessLayoutDelegate (frontmost + stagger), but
 * removals never trigger a reflow — survivors keep their currentDelay
 * exactly as-is and the gap left by the removed child is never closed.
 *
 * Note: because computeSpawnDelay still anchors to frontmost currentDelay,
 * and currentDelay values never decrease under this delegate, the parent
 * timeline's used span grows monotonically with total spawns over the
 * session — it does not shrink back down as children are removed. This is
 * correct for "items stay where they visually landed" use cases and wrong
 * for long-running high-churn ones; see GaplessLayoutDelegate for the
 * bounded-span alternative.
 */
export class StaticLayoutDelegate extends GaplessLayoutDelegate {
  computeReflow(children, removedChild) {
    return [];
  }
}

export const defaultStaticLayoutDelegate = new StaticLayoutDelegate();
```

---

## Change 9 — `destroy()`: clear `#parent`

**WRONG (current, end of `destroy()`):**

```js
    this.#pendingRemovals.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.#pendingRemovals.clear();
  }
```

**CORRECT:**

```js
    this.#pendingRemovals.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.#pendingRemovals.clear();

    this.#parent = null;
  }
```

---

## Tests to add

### `MotionInstance.test.js` — new cases

1. `parent` is `null` on a freshly constructed instance with no parent.
2. After `parent.addChild(...)`, `child.parent === parent` (strict equality,
   not just truthy).
3. There is no public way to set `parent` from outside — do NOT test this via
   `child.parent = something` silently succeeding (that would pass anyway
   for a plain object property write, which proves nothing since `#parent`
   is a true private field and any external `.parent = x` assignment is a
   no-op on a getter-only accessor and should throw in strict mode / be a
   TypeError). Assert it throws.
4. After `child.destroy()`, `child.parent === null`.
5. Existing `addChild` spawn-placement tests and `removeChild` reflow tests
   must all still pass unmodified — they are the regression guard proving
   `GaplessLayoutDelegate` extraction is behavior-preserving.
6. New test: constructing a `MotionInstance` with `config.layoutDelegate` set
   to a custom stub delegate causes `addChild`/`removeChild` to call the
   stub's `computeSpawnDelay`/`computeReflow` instead of the default (spy on
   the stub's methods, assert call args match `{ stagger, schemaMotion }`
   shape and that `children` passed to `computeReflow` still contains the
   removed child).

### `GaplessLayoutDelegate.test.js` — new, pure unit tests, no GSAP/timeline needed

- `computeSpawnDelay([], { stagger: 5 })` → `0`.
- `computeSpawnDelay([{currentDelay: 10}], { stagger: 5 })` → `15`.
- `computeSpawnDelay` with multiple children picks the max `currentDelay`,
  not the last-inserted one.
- `computeReflow` on removing rank-0 (frontmost) → `[]`.
- `computeReflow` on removing a mid-chain child → returns correct
  `{child, delay}` pairs for every subsequent sibling, in rank order.
- `computeReflow` when `removedChild` is not present in `children` → `[]`
  (defensive; `removedRank` would be `-1`, same branch as rank-0).

### `StaticLayoutDelegate.test.js` — new, pure unit tests

- `computeReflow` always returns `[]` regardless of rank (test at least
  rank-0 and mid-chain to prove it's unconditional, not accidentally
  matching `GaplessLayoutDelegate`'s rank-0 case).
- `computeSpawnDelay` behaves identically to `GaplessLayoutDelegate` (inherited,
  not reimplemented — a quick equality-of-behavior test is enough, no need
  to duplicate every `GaplessLayoutDelegate` case).

---

## Verification checklist (run after implementation, on a fresh clone)

```bash
# 1. Full suite still green, count should only grow (new delegate tests added,
#    zero existing tests removed or altered in assertion meaning)
npx vitest run

# 2. No leftover references to the old names anywhere
grep -rn "ReflowLayoutDelegate" src/ && echo "FAIL: old base class name still referenced"
grep -rn "GapLayoutDelegate" src/ | grep -v "Gapless" && echo "FAIL: old delegate name still referenced"

# 3. Confirm inline placement/reflow math was actually removed from MotionInstance,
#    not just supplemented (this must return nothing inside addChild/removeChild bodies)
grep -n "frontmostDelay\|removedRank" src/domain/instance/MotionInstance.js

# 4. Confirm #parent is a true private field, not a public property
grep -n "#parent" src/domain/instance/MotionInstance.js

# 5. Confirm delegate wiring present
grep -n "layoutDelegate" src/domain/instance/MotionInstance.js

# 6. Confirm StaticLayoutDelegate extends GaplessLayoutDelegate (not LayoutDelegate directly)
grep -n "class StaticLayoutDelegate" src/domain/instance/StaticLayoutDelegate.js
```

Do not trust a green `npx vitest run` alone as proof — additionally grep-confirm
items 2–6 above, and manually re-read `MotionInstance.js`'s `addChild`/
`removeChild`/`destroy()` in full after the diff lands to confirm no stray
duplicate logic was left behind (Gemini's smallest-diff instinct has
previously copied logic into a second call site instead of fully removing the
original — check for exactly that here).
