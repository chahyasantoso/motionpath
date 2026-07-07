# Bug Report — MotionPath Moto Demo: Animations Not Rendering

**Date:** 2026-07-06  
**Affected page:** `/moto` (MotorcyclePage)  
**Symptom:** Motorcycle, clouds, and streaks were invisible and not animated.

---

## Bug 1 — React Strict Mode Wipes the Pending Subscription Queue

### Root Cause

React's `StrictMode` intentionally double-mounts components in development to surface side-effect bugs. The mount/unmount sequence on page load was:

```
1. Child elements mount  → subscribe() called → entries buffered in `pending[]`
2. Parent unmounts       → destroy() → clearCore() called
3. *** clearCore() wiped the pending[] array ***
4. Children re-mount     → subscribe() called again → new entries buffered
5. setCore() called      → pending[] flushed → OK so far
6. *** But then another clearCore() + setCore() cycle fires ***
7. setCore() sees pending[] is empty → nothing is wired → no animations
```

The critical flaw was in [`deferredSubscribe.js`](file:///d:/dev/motionpath/src/lib/deferredSubscribe.js): `clearCore()` was clearing the `pending[]` array, making it impossible for buffered subscriptions to survive across the engine's destroy/reload cycle.

### Fix

`clearCore()` was changed to **only release the reference to the core** (and nullify active `realUnsubscribe` handles), but **never touch the `pending[]` array**. Pending subscriptions now survive across any number of core replacements and are correctly flushed the next time `setCore()` is called.

```diff
// deferredSubscribe.js
clearCore() {
-  core = null;
-  pending = [];           // ← BUG: wiped buffered subscriptions
-  for (const entry of active) {
-    entry.realUnsubscribe = null;
-  }
+  core = null;            // ← only drops the core reference
+  for (const entry of active) {
+    entry.realUnsubscribe = null;   // active handles are now invalid
+  }
  // pending[] is intentionally left intact
},
```

**Files changed:**
- [`src/lib/deferredSubscribe.js`](file:///d:/dev/motionpath/src/lib/deferredSubscribe.js)
- [`src/lib/__tests__/deferredSubscribe.test.js`](file:///d:/dev/motionpath/src/lib/__tests__/deferredSubscribe.test.js) — test expectation updated to assert pending subscriptions are preserved and flushed after `setCore`

---

## Bug 2 — GSAP Circular Reference Crashed the Subscription Callback

### Root Cause

A temporary debug statement added to [`useMotionSubscriber.js`](file:///d:/dev/motionpath/src/hooks/useMotionSubscriber.js) was calling `JSON.stringify(rawData)` directly on the raw GSAP proxy object. That object contained an internal circular reference via its `_gsap` property (`GSCache → target → _gsap → GSCache`), causing a fatal `TypeError: Converting circular structure to JSON`.

Because this error was thrown **inside the subscription callback during the `setCore()` flush**, the `try/catch` in `deferredSubscribe.js` caught and silently discarded it — but the element was never added to the `active` set. As a result, all 6 subscriptions (streak-a, streak-b, cloud-a, cloud-b, shadow, bike) were silently lost on every flush.

```
[DEBUG DeferredSubscribe] Flushing pending elementId=moto-bike
[DEBUG EngineCore] calling callback immediately for elementId=moto-bike
[DEBUG DeferredSubscribe] Flush failed for elementId=moto-bike:
  Converting circular structure to JSON
  --> starting at object with constructor 'GSCache'
  |   property 'target' -> object with constructor 'Object'
  --- property '_gsap' closes the circle
```

### Fix

The `_gsap` property was stripped from a shallow copy before stringifying. The debug statements were then removed entirely once the animation was confirmed working.

```diff
// useMotionSubscriber.js  (debug code — now removed)
- console.log(..., JSON.stringify(rawData), ...);
+ const cleanRaw = { ...rawData };
+ delete cleanRaw._gsap;
+ console.log(..., JSON.stringify(cleanRaw), ...);
```

**Files changed:**
- [`src/hooks/useMotionSubscriber.js`](file:///d:/dev/motionpath/src/hooks/useMotionSubscriber.js)

---

## Cleanup

After confirming the animation worked, all temporary debug instrumentation was removed:

| File | What was removed |
|---|---|
| [`src/lib/deferredSubscribe.js`](file:///d:/dev/motionpath/src/lib/deferredSubscribe.js) | All `console.log` debug lines |
| [`src/hooks/useMotionSubscriber.js`](file:///d:/dev/motionpath/src/hooks/useMotionSubscriber.js) | Tick logger, mount/unmount logs, `_debugCount` variable |
| [`src/hooks/useMotionProject.js`](file:///d:/dev/motionpath/src/hooks/useMotionProject.js) | `loadProject OK` success log |
| [`src/lib/engineCore.js`](file:///d:/dev/motionpath/src/lib/engineCore.js) | Immediate-callback debug log |
| [`src/components/Motorcycle/MotorcyclePage.jsx`](file:///d:/dev/motionpath/src/components/Motorcycle/MotorcyclePage.jsx) | Full debug overlay panel + console interceptor hook |

---

## Test Coverage

All **164 unit/integration tests** pass after the fix, including the updated deferred-subscribe test:

```
✓ clears core reference but preserves pending on clearCore
```

> [!IMPORTANT]
> Bug 2 was **masked** by Bug 1's `try/catch`. The error was swallowed silently, making it look like a subscription wiring problem rather than a serialisation crash. The real chain was: circular reference → exception in callback → catch block → subscription silently lost.
