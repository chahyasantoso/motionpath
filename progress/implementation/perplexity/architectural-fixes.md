# MotionPath v3 — Architectural Fix Log

This document records the six architectural issues identified in the external code review of the `engines` and `MotionInstance` layers, the root cause of each, and the exact fix applied.

---

## Issue 1 — Driver duplication in `#setupDriver`

### Problem

`MotionInstance.#setupDriver` unconditionally applied `repeat`, `yoyo`, and `repeatDelay` to the instance's own GSAP timeline for every `gsap-timeline` driver, regardless of whether the instance was a standalone owner or a grouped member:

```js
// BEFORE — always ran, even for grouped members
this.timeline
  .repeat(trigger.repeat ?? 0)
  .yoyo(!!trigger.yoyo)
  .repeatDelay(trigger.repeatDelay ?? 0);
```

Grouped instances have `_suppressDriver: true` injected by `EditorEngine._configForMount`, and `TimelineGroupController` is responsible for configuring the master timeline. But the `.repeat/.yoyo/.repeatDelay` block ran before the `#ownsTrigger` guard, so each member silently double-configured its own holder timeline with the same settings as the master. This created an implicit contract: the engine must remember to suppress the driver, or the instance would misconfigure itself with no error.

### Fix

Hoisted the `owns = this.#ownsTrigger(config)` check and wrapped the entire timeline-configuration block inside it. Grouped members now leave their holder timelines as plain, unconfigured containers — exactly what `TimelineGroupController` expects.

```js
// AFTER — only runs when this instance owns its driver
const owns = this.#ownsTrigger(config);
if (driverType === 'timeline' || driverType === 'gsap-timeline') {
  if (owns) {
    this.timeline.repeat(...).yoyo(...).repeatDelay(...);
    if (config.autoplay ?? true) this.timeline.play();
  }
}
```

**Files changed:** `src/domain/instance/MotionInstance.js`

---

## Issue 2 — `#reflowSiblings` unnecessarily allocated a tween when `duration === 0`

### Problem

The default `staggerTransition.duration` is `0`. In this default state, every child reflow still allocated a full `gsap.to` tween object that resolved immediately with `duration: 0`. The old code even had a comment acknowledging the waste (in Indonesian):

```js
// kalau duration 0 masih kurang efisien karena
// masih bikin object tween meskipun langsung resolve
return new Promise(resolve => {
  child.delayTween = gsap.to(child.timeline, { startTime: delay, duration, ... });
});
```

Every stagger-driven layout update — even simple adds and removes — created throw-away GSAP objects, adding unnecessary GC pressure.

### Fix

Added an early return that calls `child.timeline.startTime(delay)` directly and resolves the promise synchronously, bypassing `gsap.to` entirely when `duration === 0`:

```js
// AFTER — zero-duration is a synchronous snap, no tween allocated
if (duration === 0) {
  child.timeline.startTime(delay);
  this.timeline.time(this.timeline.time());
  return Promise.resolve();
}
```

Tests that verified the old behavior (checking `gsap.to` was called or that `delayTween` was set) were updated to assert the new semantics: no tween created, `currentDelay` updated directly.

**Files changed:** `src/domain/instance/MotionInstance.js`, `src/domain/instance/__tests__/MotionInstance.test.js`

---

## Issue 3 — `destroy()` race condition: notification order and missing `broadcast()` guard

### Problem

Two related bugs:

**3a — `onSubscriberChange` fired after state teardown.**
`destroy()` cleared the timeline, tracks, and children _before_ calling `this.#onSubscriberChange(this, false)`. The engine's callback calls `this._core.unregisterActiveInstance(inst)`, which may inspect the instance. If anything in the engine's unregistration path touched the instance state (e.g. logging, checks), it would find an already-torn-down object.

```js
// BEFORE — notification fired last, after all state was gone
this.timeline.kill();
this.tracksMap.clear();
// ... children destroyed ...
if (this.#onSubscriberChange && hadActiveSubscribers) {
  this.#onSubscriberChange(this, false); // ← instance already gutted
}
```

**3b — `broadcast()` had no guard against a destroyed instance.**
GSAP's ticker can fire a queued `onUpdate` callback one frame after `destroy()` is called. `broadcast()` iterates `this.tracksMap`, which by then is already cleared. While harmless in practice (no keys to iterate), it represented a structural gap — a destroyed instance with no defensive barrier.

### Fix

**3a:** Moved the `onSubscriberChange` call to immediately after setting `this.#destroyed = true`, before any teardown:

```js
// AFTER — notification fires first, instance still intact
this.#destroyed = true;
if (this.#onSubscriberChange && hadActiveSubscribers) {
  this.#onSubscriberChange(this, false); // ← called while object is still whole
}
// teardown follows...
this.timeline.kill();
this.tracksMap.clear();
```

**3b:** Added an early-return guard at the top of `broadcast()`:

```js
broadcast() {
  if (this.#destroyed) return;
  // ...
}
```

**Files changed:** `src/domain/instance/MotionInstance.js`

---

## Issue 4 — `EditorEngine` has a second `#deferredCall` — is it redundant?

### Problem

`EditorEngine` declares its own `#deferredCall` instance alongside the one already in `BaseEngine`. At first read this looked like state fragmentation or a copy-paste mistake.

### Analysis

They are not duplicates. They queue against **different cores** with **independent lifecycles**:

|              | `BaseEngine.#deferredCall`           | `EditorEngine.#deferredCall`           |
| ------------ | ------------------------------------ | -------------------------------------- |
| Core set by  | `_core` (GSAP `EngineCore`)          | `#trackIndex` (a `Map`)                |
| Flushed when | GSAP ticker is running               | `loadProject` finishes indexing tracks |
| Used for     | `registerActiveInstance` bookkeeping | `subscribe(trackId, cb)` calls         |

A `subscribe()` call from a React hook can arrive before `loadProject` completes. The `EditorEngine.#deferredCall` buffers it until the track index is ready. `BaseEngine`'s queue is unrelated — it gates GSAP tick registration. Flushing one implies nothing about the other.

### Fix

No code change needed. Added a block comment in `EditorEngine` explaining the separation so the next reader doesn't remove one assuming it's redundant:

```js
// A second, independent deferred-call queue keyed on #trackIndex instead of
// EngineCore. BaseEngine's deferredCall buffers subscriber calls until the
// GSAP tick core is ready; this one buffers track-level subscribe() calls
// until loadProject has finished building the #trackIndex. They manage
// different lifecycles and must remain separate — flushing one does not
// imply the other is ready.
```

**Files changed:** `src/engines/EditorEngine.js`

---

## Issue 5 — `resolveMotion` accepted both raw schema and parsed domain model _(fixed in prior session)_

### Problem

`resolveMotion.resolve` had a branch that accepted either a raw JSON schema or a parsed `MotionProject` domain model:

```js
// BEFORE — dual input formats created ambiguity
const isDomain = project && typeof project.motions?.get === "function";
const originalMotion = isDomain
  ? getMotion(project, motionId)
  : (project?.motions || []).find((m) => m.motionId === motionId);
```

This meant callers could pass either format and get silently different behavior. The engine always had a parsed `_project` available; there was no reason to support the raw format.

### Fix

Removed the `isDomain` branch. The resolver now requires a parsed domain model and throws clearly if it isn't one:

```js
// AFTER — single accepted format
if (!project || typeof project.motions?.get !== "function") {
  throw new Error(
    "resolveMotion: expected a parsed MotionProject domain model.",
  );
}
```

**Files changed:** `src/engines/resolveMotion.js`

---

## Issue 6 — `#loadGeneration` was double-incremented

### Problem

`loadProject` incremented `#loadGeneration` at the top to stamp the async operation, then called `_cleanup()` internally. `_cleanup()` also incremented the counter:

```js
// loadProject
const loadId = ++this.#loadGeneration; // → generation = N

// ... await ensureLoaded(plugin) ...

this._cleanup(); // → generation = N+1 (inside _cleanup)
```

After the await, the guard `if (loadId !== this.#loadGeneration)` always evaluated as `N !== N+1` — **always true**, so every `loadProject` call with an async plugin load would always appear stale and abort. The engine would silently refuse to complete any project load that triggered a plugin fetch.

### Fix

Removed the `++this.#loadGeneration` from `_cleanup()`. Only `loadProject` increments the counter. `_cleanup()` is a pure teardown routine; it has no reason to advance the generation:

```js
// AFTER — _cleanup() does not touch the counter
_cleanup() {
  for (const instance of this._instances.values()) { ... }
  // ...
}
```

**Files changed:** `src/engines/BaseEngine.js`

---

## Summary

| #   | Issue                              | Root cause                                 | Fix type                 |
| --- | ---------------------------------- | ------------------------------------------ | ------------------------ |
| 1   | Driver duplication                 | Timeline config ran before ownership check | Code fix                 |
| 2   | Zero-duration tween waste          | No early-exit for `duration === 0`         | Code fix + test update   |
| 3   | Destroy race conditions            | Wrong notification order + missing guard   | Code fix                 |
| 4   | Dual `#deferredCall` confusion     | Undocumented intent                        | Documentation            |
| 5   | Resolver dual-format input         | Legacy compatibility branch                | Code fix (prior session) |
| 6   | `#loadGeneration` double-increment | Increment in wrong place                   | Code fix                 |
