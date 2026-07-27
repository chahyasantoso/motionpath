# Brief: Fix `MotionInstance.destroy()` subscriber-unregister ordering bug

## File

`src/domain/instance/MotionInstance.js`

## Locked decision

The `destroy()` method must capture whether the instance had any subscribers
**before** `tracksMap` is cleared, and use that captured value — not
`tracksMap.size` — to decide whether to fire `onSubscriberChange(this, false)`.

## The bug

In the current code, `tracksMap.clear()` runs before the `tracksMap.size > 0`
check, so the check is always `false` post-clear. As a result,
`onSubscriberChange(this, false)` never fires from `destroy()`. Any instance
that still had active subscribers at the moment it was destroyed never gets
unregistered from `BaseEngine`/`engineCore`'s `activeInstances` Set — it stays
in the ticker loop forever (dead-weight `broadcast()` calls every frame), and
if it was the last active instance, `gsap.ticker` never stops.

## Non-goals (do not touch)

- Do not change `subscribe()`/its own `onSubscriberChange` calls (lines
  ~194–232) — those are correct and out of scope.
- Do not change `children.forEach(child => child.destroy())` recursion logic.
- Do not change `#scrollTrigger` or `timeline.kill()` cleanup order.
- Do not add new public methods or change the `destroy()` signature.
- Do not touch `engineCore.js` or `BaseEngine.js` — the fix is entirely
  contained in `MotionInstance.js`.

## WRONG (current code, `destroy()` method)

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

## CORRECT (fixed code)

```js
destroy() {
  const hadActiveSubscribers = Array.from(this.#subscribers.values())
    .reduce((sum, set) => sum + set.size, 0) > 0;

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

  if (this.#onSubscriberChange && hadActiveSubscribers) {
    this.#onSubscriberChange(this, false);
  }
}
```

Note: `hadActiveSubscribers` is computed from `#subscribers` (the actual
subscriber registry), not `tracksMap` — this is also more correct than the
original intent, since `tracksMap.size` was never really "does this instance
have subscribers," it was "does this instance have tracks at all." Use
`#subscribers`, not `tracksMap`, for this check.

## Verification checklist (grep + behavioral, run on a fresh clone)

1. **Ordering grep** — confirm the subscriber check no longer reads
   `tracksMap` and is computed before any kill/clear call:

   ```
   grep -n "hadActiveSubscribers\|tracksMap.clear\|onSubscriberChange(this, false)" src/domain/instance/MotionInstance.js
   ```

   Expected: `hadActiveSubscribers` line number < `tracksMap.clear()` line
   number < `onSubscriberChange(this, false)` line number.

2. **Old buggy pattern must be gone**:

   ```
   grep -n "tracksMap.size > 0" src/domain/instance/MotionInstance.js
   ```

   Expected: no match.

3. **Behavioral test — must be added to
   `src/domain/instance/__tests__/MotionInstance.test.js`** (spy-based, not
   "did it run"):
   - Create an instance, call `subscribe(trackId, cb)` so it has an active
     subscriber, spy on the `onSubscriberChange` callback passed via
     `context`, call `destroy()`, assert the spy was called with
     `(instance, false)` exactly once after destroy (in addition to the
     `(instance, true)` call from `subscribe()`).
   - Create a second instance, do **not** subscribe to it, call `destroy()`,
     assert `onSubscriberChange` was **never** called for that instance (no
     spurious `false` calls for instances that never had subscribers).

4. **Run full suite**: `npx vitest run` — 228+ tests must still pass, plus
   the two new assertions above.

Do not report success from test-suite-passes alone — confirm both new
assertions in item 3 are present and actually exercise the spy call, not just
that `destroy()` doesn't throw.
