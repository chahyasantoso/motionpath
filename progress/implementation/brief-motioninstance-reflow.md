# Brief: Injectable reflow + deferred removal for MotionInstance

**File to edit:** `src/domain/instance/MotionInstance.js`
**Tests to edit:** `src/domain/instance/__tests__/MotionInstance.test.js`

Read the whole current file before starting. Do not guess at surrounding code —
every WRONG/CORRECT pair below is copied verbatim from the current file so you
can locate it exactly.

---

## Locked decisions (do not relitigate)

1. `removeChild` stays **synchronous in its return type** (returns `undefined`,
   not a Promise). Callers never `await` it.
2. The moment `removeChild(child)` is called, `child` is spliced out of
   `this.children` **immediately** — before any animation runs. Anything
   reading `instance.children` right after the call must see the child gone.
3. The actual GSAP mutation (`this.timeline.remove(child.timeline)` +
   `child.destroy()`) is **deferred** until the sibling reflow animation
   finishes.
4. The sibling reflow (the tween that slides remaining children to their new
   stagger positions) is a **single batched operation over all affected
   siblings**, not one animation per sibling. It must be injectable via
   `context.reflowSiblings` at construction time, defaulting to the current
   `gsap.to(...)` behavior (extracted, not rewritten).
5. `onChildChange` listeners fire for `removeChild` **only after** the real
   GSAP removal happens (i.e., after reflow completes) — not at splice time.
   `addChild`'s listener firing timing is unchanged (fires immediately, as
   today).
6. `addChild` gets a `#destroyed` guard. It gets **no** reflow/pending-removal
   logic — it is append-only and cannot shift existing siblings.
7. `destroy()` must clean up any in-flight removal (kill its `delayTween`,
   call `child.destroy()`) so nothing leaks if `destroy()` runs mid-reflow.
8. Double-calling `removeChild(child)` on the same child while its reflow is
   still in flight must be a no-op the second time.

## Non-goals — do not build these

- Do **not** call `ScrollTrigger.disable()`, `.enable()`, `.refresh()`, or
  `.scroll()` anywhere in `MotionInstance`. That was an abandoned approach
  (see the 3 deleted tests below) and is explicitly rejected — refresh
  timing is left to the consumer's `onChildChange` handler.
- Do **not** make `addChild` async or give it a reflow hook.
- Do **not** build a general multi-listener "beforeChildChange" event bus.
  There is exactly one injected `reflowSiblings` function per instance, not
  a subscribable list.
- Do **not** add debouncing logic inside `MotionInstance`. If asked, the
  answer is: that's the consuming code's responsibility on `onChildChange`,
  not this file's.
- Do **not** change `addChild`'s stagger/delay math. Only add the
  `#destroyed` guard to it.

---

## Change 1 — constructor: add tracking fields + reflow dependency

**WRONG (current, lines ~18–41):**
```js
  #subscribers = new Map(); // trackId -> Set<wrapper>
  #childListeners = new Set();
  #onSubscriberChange;
  #deps;
  #scrollTrigger = null;

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
    this.currentDelay = undefined;
    this.delayTween = null;
    this.paddingCallback = null;

    this.#deps = this.deps;
    this.#onSubscriberChange = context.onSubscriberChange;
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

  constructor(motionId, config, schemaMotion, context) {
    this.id = MotionInstance.#generateUniqueId();
    this.motionId = motionId;
    this.config = config || {};
    this.schemaMotion = schemaMotion;
    this.deps = {
      resolveElement: context.resolveElement,
      mountInstance: context.mountInstance,
      reflowSiblings: context.reflowSiblings
    };
    this.templates = context.project?.templates || {};
    this.children = [];
    this.tracksMap = new Map();
    this.currentDelay = undefined;
    this.delayTween = null;
    this.paddingCallback = null;

    this.#deps = this.deps;
    this.#onSubscriberChange = context.onSubscriberChange;
```

`context.reflowSiblings` is optional. If the caller doesn't pass one, the
default (Change 3) is used.

---

## Change 2 — `addChild`: guard against destroyed instance

**WRONG (current, lines ~275–279):**
```js
  addChild(motionIdOrConfig, config) {
    let targetMotionId = this.motionId;
    let targetConfig = {};

    if (typeof motionIdOrConfig === 'string') {
```

**CORRECT:**
```js
  addChild(motionIdOrConfig, config) {
    if (this.#destroyed) {
      throw new Error(`addChild: instance "${this.id}" is destroyed.`);
    }

    let targetMotionId = this.motionId;
    let targetConfig = {};

    if (typeof motionIdOrConfig === 'string') {
```

Nothing else in `addChild` changes. Do not touch the stagger/delay
calculation, the native GSAP nesting calls, or the `#childListeners` firing
at the end of `addChild`.

---

## Change 3 — replace `removeChild` entirely

**WRONG (current, lines ~313–346, the full method):**
```js
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      
      // Native GSAP detach
      this.timeline.remove(child.timeline);
      child.destroy();

      const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
      this.children.forEach((c, newIdx) => {
        const newDelay = newIdx * stagger;
        if (c.currentDelay === undefined) {
          c.currentDelay = c.config.delay || 0;
        }
        if (c.delayTween) c.delayTween.kill();
        c.delayTween = gsap.to(c.timeline, {
          startTime: newDelay,
          duration: 0.6,
          ease: 'power2.out',
          onUpdate: () => {
            // Force parent timeline to re-evaluate and broadcast at its current playhead position
            this.timeline.time(this.timeline.time());
          }
        });
      });

      this.#childListeners.forEach(cb => cb());

      // if (typeof window !== 'undefined' && ScrollTrigger) {
      //   ScrollTrigger.refresh();
      // }
    }
  }
```

**CORRECT (replace the whole method with these four methods, in this order,
right where `removeChild` was):**
```js
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1 || this.#pendingRemovals.has(child)) return;

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const targets = this.children.map((c, newIdx) => ({ child: c, delay: newIdx * stagger }));

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

  #reflowSiblings(targets) {
    const reflow = this.#deps.reflowSiblings ?? MotionInstance.#defaultReflow;
    return Promise.resolve(reflow(targets, this.timeline));
  }

  static #defaultReflow(targets, parentTimeline) {
    return Promise.all(targets.map(({ child, delay }) => {
      if (child.currentDelay === undefined) {
        child.currentDelay = child.config.delay || 0;
      }
      if (child.delayTween) child.delayTween.kill();

      return new Promise(resolve => {
        child.delayTween = gsap.to(child.timeline, {
          startTime: delay,
          duration: 0.6,
          ease: 'power2.out',
          onUpdate: () => {
            parentTimeline.time(parentTimeline.time());
          },
          onComplete: () => {
            child.currentDelay = delay;
            resolve();
          }
        });
      });
    }));
  }
```

Notes for implementation:
- `#reflowSiblings` wraps the injected/default call in `Promise.resolve(...)`
  so a custom `reflowSiblings` that returns `undefined` (synchronous, no
  animation) doesn't break the `await` in `#finishRemoval`.
- `targets` is computed from `this.children` **after** the splice, so it
  already excludes the removed child — this is the corrected, final layout,
  not the pre-removal one.
- The commented-out `ScrollTrigger.refresh()` block is deleted, not just left
  commented. It should not exist in any form in this file.

---

## Change 4 — `destroy()`: clean up in-flight removals

**WRONG (current, lines ~348–369, the full method):**
```js
  destroy() {
    if (this.#scrollTrigger) {
      this.#scrollTrigger.kill();
      this.#scrollTrigger = null;
    }

    this.timeline.kill();
    for (const track of this.tracksMap.values()) {
      track.tween.kill();
    }
    this.tracksMap.clear();

    this.children.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.children.length = 0;

    if (this.#onSubscriberChange && this.tracksMap.size > 0) {
      this.#onSubscriberChange(this, false);
    }
  }
```

**CORRECT:**
```js
  destroy() {
    this.#destroyed = true;

    if (this.#scrollTrigger) {
      this.#scrollTrigger.kill();
      this.#scrollTrigger = null;
    }

    this.timeline.kill();
    for (const track of this.tracksMap.values()) {
      track.tween.kill();
    }
    this.tracksMap.clear();

    this.children.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.children.length = 0;

    this.#pendingRemovals.forEach(child => {
      if (child.delayTween) child.delayTween.kill();
      child.destroy();
    });
    this.#pendingRemovals.clear();

    if (this.#onSubscriberChange && this.tracksMap.size > 0) {
      this.#onSubscriberChange(this, false);
    }
  }
```

`this.#destroyed = true` must be the **first line** of the method — it's
what makes `#finishRemoval`'s post-await check correct.

---

## Test file changes

### Delete these 3 tests (currently failing, testing an abandoned approach)

In `describe('Scroll-Driver Stagger Freeze/Unfreeze', ...)`:
- `'disables ScrollTrigger before addChild mutation'`
- `'calls scroll() to sync position after unfreeze on addChild with no stagger change'`
- `'defers actual timeline removal until stagger slide completes on removeChild'`

Also delete the test `'does NOT freeze ScrollTrigger on removeChild (deferred removal)'`
— it happens to pass today, but it's asserting the *absence* of machinery we
are now permanently deleting (not "not yet built"), so its premise is gone.
Delete the whole `describe('Scroll-Driver Stagger Freeze/Unfreeze', ...)`
block, including its `beforeEach`, once these are gone — nothing scrub-related
should remain in this describe block per the locked decisions above.

### Update this existing test

`'removes child and triggers delay updates on remaining children'` — keep as
is, no code change needed. Confirm after your edits that it still passes: the
default reflow's `gsap.to(...)` call happens synchronously inside the
(un-awaited) `#finishRemoval` call chain, so `child2.delayTween` is set
synchronously by the time `instance.removeChild(child1)` returns. If this
assertion fails after your changes, you have broken the synchronous-dispatch
chain — do not "fix" the test by adding `await`; fix the code instead.

### Add these new tests

```js
it('removeChild is a no-op if called twice on the same child mid-reflow', () => {
  const instance = createTestInstance('time-motion', {}, timelineSchema);
  const child1 = instance.addChild('child-motion', {});
  instance.addChild('child-motion', {});

  const removeSpy = vi.spyOn(instance.timeline, 'remove');
  instance.removeChild(child1);
  instance.removeChild(child1); // second call, still mid-reflow

  // default reflow's onComplete hasn't fired in this mocked environment,
  // so neither call should have reached the real detach yet, and there
  // must be only one pending removal, not two independent ones.
  expect(instance.children).toHaveLength(1);
});

it('addChild throws after destroy()', () => {
  const instance = createTestInstance('time-motion', {}, timelineSchema);
  instance.destroy();

  expect(() => instance.addChild('child-motion', {})).toThrow(/destroyed/);
});

it('destroy() kills delayTween and destroys children pending removal', () => {
  const instance = createTestInstance('time-motion', {}, timelineSchema);
  const child1 = instance.addChild('child-motion', {});
  instance.addChild('child-motion', {});

  instance.removeChild(child1); // starts reflow, child1 now pending
  const destroySpy = vi.spyOn(child1, 'destroy');
  const tweenKillSpy = child1.delayTween ? vi.spyOn(child1.delayTween, 'kill') : null;

  instance.destroy();

  expect(destroySpy).toHaveBeenCalled();
  if (tweenKillSpy) expect(tweenKillSpy).toHaveBeenCalled();
});

it('uses an injected reflowSiblings function instead of the default tween', async () => {
  const customReflow = vi.fn().mockResolvedValue(undefined);
  const instance = createTestInstance('time-motion', { reflowSiblings: customReflow }, timelineSchema);
  const child1 = instance.addChild('child-motion', {});
  instance.addChild('child-motion', {});

  instance.removeChild(child1);
  await Promise.resolve(); // flush microtasks so #finishRemoval's await resolves

  expect(customReflow).toHaveBeenCalledTimes(1);
  const [targets] = customReflow.mock.calls[0];
  expect(targets).toEqual([{ child: expect.anything(), delay: 0 }]);
});

it('onChildChange fires for removeChild only after reflow completes, not at splice time', async () => {
  const customReflow = vi.fn().mockResolvedValue(undefined);
  const instance = createTestInstance('time-motion', { reflowSiblings: customReflow }, timelineSchema);
  const child1 = instance.addChild('child-motion', {});

  const listener = vi.fn();
  instance.onChildChange(listener);
  instance.removeChild(child1);

  expect(listener).not.toHaveBeenCalled(); // reflow (mocked) hasn't resolved yet

  await Promise.resolve();
  await Promise.resolve();

  expect(listener).toHaveBeenCalledTimes(1);
});
```

Check `createTestInstance`'s signature in the existing test file before using
it above — if it doesn't currently thread a `reflowSiblings` option through to
the `context` passed into `new MotionInstance(...)`, add that plumbing to the
test helper only. Do not change how `createTestInstance` builds `config` vs
`context` beyond adding this one field.

---

## Verification checklist (grep-based — run these, don't trust your own summary)

From repo root:

```bash
# 1. No ScrollTrigger freeze/refresh machinery remains in MotionInstance.js
grep -n "ScrollTrigger.refresh\|\.disable(false)\|\.enable()\|\.scroll(" src/domain/instance/MotionInstance.js
# Expect: 0 matches outside of #setupDriver's existing scrub ScrollTrigger.create call
#         (i.e. no NEW disable/enable/refresh/scroll calls added)

# 2. #destroyed flag exists and is checked in both addChild and #finishRemoval
grep -n "#destroyed" src/domain/instance/MotionInstance.js
# Expect: field declaration, set in destroy(), read in addChild(), read in #finishRemoval

# 3. #pendingRemovals exists and is used for the double-call guard + destroy cleanup
grep -n "#pendingRemovals" src/domain/instance/MotionInstance.js
# Expect: field declaration, add() in removeChild, delete() in #finishRemoval,
#         forEach+clear() in destroy()

# 4. removeChild has no direct gsap.to call left inline (must be in #defaultReflow only)
grep -n "gsap.to" src/domain/instance/MotionInstance.js
# Expect: exactly 1 match, inside #defaultReflow

# 5. removeChild does not return a Promise / is not declared async
grep -n "removeChild(child)" src/domain/instance/MotionInstance.js
# Expect: "removeChild(child) {" — NOT "async removeChild"

# 6. The 3 abandoned freeze/unfreeze tests are gone
grep -n "disables ScrollTrigger before addChild\|calls scroll() to sync position\|defers actual timeline removal until stagger slide completes" src/domain/instance/__tests__/MotionInstance.test.js
# Expect: 0 matches

# 7. Full suite passes, and the count of passing tests went up (new tests added), not just "green"
npx vitest run src/domain/instance/__tests__/MotionInstance.test.js
```

Do not report this brief as complete based on "tests pass." Report the actual
output of each grep command above alongside the vitest summary.
