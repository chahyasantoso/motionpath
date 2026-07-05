# Consolidated Review — Shared Project Builder (Brief 2)

Reviews from two independent pass over `src/lib/builder.js`, `src/lib/plugins.js`, and `src/lib/__tests__/builder.test.js` against `implementation-brief-2-builder.md`.

> [!NOTE]
> Both reviews agreed on what is **correct**: the core algorithms — `resolveDirection`, deep-merge, ease-collision defense-in-depth, tweenVars collision detection, lazy-load caching, and scenario/group timeline construction — all follow the spec exactly, in the stated order. The issues below are additive findings, not a rejection of the overall shape.

---

## Issue 1 — Rejected `stagger` Object Shape Crept Back In

**Severity: Bug (one-line fix)**  
**Files:** [builder.js](file:///d:/dev/motionpath/src/lib/builder.js#L134-L141)  
**Agreed by: both reviews**

The locked design decision from Brief 1 Task 1 is: *stagger is a plain number only; GSAP's native object-form stagger (`{ each, amount, from }`) is explicitly rejected*. The validator now enforces this. The builder should trust the validator (§7: "trust Brief 1, do not re-verify") and only handle numbers.

**Current code:**
```js
if (typeof stagger === 'object' && typeof stagger.each === 'number') {
  return stagger.each * idx;
}
```

This is dead code — a validated schema will never reach this branch. More importantly, if a bug ever caused an object stagger to slip past the validator, this code would silently accept it and stagger correctly — the exact opposite of failing visibly. It keeps a rejected design alive in a second module.

**Fix (one-liner):**
```js
const getStaggerOffset = (stagger, idx) =>
  typeof stagger === 'number' ? stagger * idx : 0;
```

---

## Issue 2 — Ease-Collision Throw Missing the Property Key

**Severity: Bug / §8 violation (one-line fix)**  
**Files:** [builder.js](file:///d:/dev/motionpath/src/lib/builder.js#L92-L98)  
**Found by: second review**

Brief 2 §8 is explicit:
> Every `throw` in this module must include the element `id` **and property key** in the message — a build failure with no location context is not debuggable in a real project with dozens of elements.

**Current throw:**
```js
throw new Error(
  `Ease collision on element "${element.id}" at percent "${percentKey}": ` +
  `different eases found ("${existingKeyframe.ease}" vs "${incomingPatch.ease}").`
);
```

The percent key is present but the **property key** (`propKey`) that just contributed the colliding ease is not. With a dozen properties on an element, you'd still have to bisect to find the offender.

**Fix:**
```js
throw new Error(
  `Ease collision on element "${element.id}" at percent "${percentKey}" ` +
  `(contributed by property "${propKey}"): ` +
  `different eases found ("${existingKeyframe.ease}" vs "${incomingPatch.ease}").`
);
```

---

## Issue 3 — `resolveDirection` Mandatory Spec Test Cases Not Present

**Severity: Test gap (tests must match spec exactly)**  
**Files:** [builder.test.js](file:///d:/dev/motionpath/src/lib/__tests__/builder.test.js#L26-L44)  
**Found by: first review**

Brief 2 §4 says **"Test cases (must pass exactly)"** with four specific inputs:

| Spec input | Spec output |
|---|---|
| `[{p:0, v:10}], undefined, 0` | `[{p:0,v:10},{p:1,v:0}]` |
| `[{p:1, v:10}], undefined, 0` | `[{p:0,v:0},{p:1,v:10}]` |
| `[{p:0,v:10},{p:1,v:20}], "fromTo", 0` | two stops returned unchanged, `direction` ignored |
| `[{p:0.0007,v:5}], undefined, 0` | treated as `p≈0`, same as first row |

The current tests use `{p:0.0005}` and `{p:0.9995}` instead of exact `0` and `1`, and `{p:0.0007}` is absent entirely. The implementation is correct (epsilon is `0.001`, so all cases pass), but the mandatory test cases from the spec text aren't present. The spec says they *must* pass — those exact inputs should be in the test file.

**Fix:** Add the four spec-literal test cases as additional assertions inside the existing `resolveDirection` describe block.

---

## Issue 4 — Lazy-Plugin Test Does Not Test Concurrency

**Severity: Test gives false confidence**  
**Files:** [builder.test.js](file:///d:/dev/motionpath/src/lib/__tests__/builder.test.js#L257-L283)  
**Found by: second review**

The spec's §3 warning is specifically about *concurrent, unawaited* calls to `ensureLoaded` racing each other — that's why it explicitly warned against the boolean-flag version. The current builder processes elements in a strictly sequential `for...of` loop with `await` inside:

```js
for (const element of elements) {
  // ...
  await ensureLoaded(plugin);  // element 2 never starts until element 1's await resolves
}
```

The existing test passes two elements through one `buildProject` call, but since `ensureLoaded` is awaited before moving to the next element, there is **no race** — element 2 always calls `ensureLoaded` after element 1's load has already resolved. The test would pass even with the buggy boolean-flag implementation the spec warned against.

The `Map`-based implementation is correct, but the test does not prove it. 

**Fix options (pick one):**
1. Export `ensureLoaded` and test directly with `Promise.all([ensureLoaded(plugin), ensureLoaded(plugin)])`, asserting `load` was called once.
2. Add a note acknowledging the sequential loop makes a race test impossible at the integration level, and rely on the module-level `Map` implementation being self-evidently correct.

---

## Issue 5 — `duration` Field Added Without Spec Authorization

**Severity: Spec gap — needs a decision, not a code fix**  
**Files:** [builder.js](file:///d:/dev/motionpath/src/lib/builder.js#L122-L128)  
**Found by: second review**

Brief 2 §5.8 gives the exact `gsap.to` call signature:
```ts
gsap.to(domNode, { keyframes: sharedKeyframes, ...sharedTweenVars, paused: true })
```

No `duration` field appears. The implementer added:
```js
const tweenDuration = element.duration ?? scenario.trigger?.duration ?? 1;
gsap.to(domNode, { keyframes: sharedKeyframes, ...sharedTweenVars, duration: tweenDuration, paused: true });
```

Without `duration`, GSAP defaults to 0.5s — which would silently break every percent-keyframe animation in practice — so the instinct here is defensible. The fallback chain (`element.duration` → `trigger.duration` → `1`) is also sensible. But:
- It's unlisted functionality
- The schema docs (`schema.md`) show `trigger.duration` only on `TriggerTime` — `scroll-observer` triggers carry no `duration` field

**Required action (from spec owner, not implementer):** Explicitly pin the duration fallback rule in the spec — where does duration live for each trigger type, what's the final fallback, and is adding `duration` to the `gsap.to` call authorized? This should become a spec addendum before the implementation is considered complete.

---

## Issue 6 — `gsap.to(domNode, ...)` Likely Wrong for Filter/Path Properties

**Severity: Architectural concern — needs clarification**  
**Files:** [builder.js](file:///d:/dev/motionpath/src/lib/builder.js#L121-L128)  
**Found by: first review only**

The spec says `gsap.to(domNode, ...)` literally, and the implementation follows this literally. However, the existing `motionEngine.js` animates a **plain proxy object** (not the DOM node), then uses `plugin.compose()` in an `onUpdate` callback to translate proxy state into actual DOM CSS. This is because `filterPlugin` writes `__blur` (not `filter: blur(...)`) and `pathPlugin` writes `__pathProgress` (not CSS coordinates) — neither maps directly to a DOM property.

Animating a real DOM node directly with these internal keys (`__blur`, `__pathProgress`) will silently do nothing useful at runtime for those properties. Tests pass because `resolveElement` returns a plain `div` mock.

**Two possible correct interpretations:**
1. The spec intends `domNode` literally and filter/path plugins need to be redesigned to write actual CSS properties directly (not intermediate keys).
2. The builder should animate a proxy object (matching `motionEngine.js` architecture), and the spec's `domNode` in §5.8 is an over-simplification.

**Required action:** Clarify with spec owner before this feeds a real engine layer.

---

## Optional — Duplicate `contribute()` Bodies in `plugins.js`

**Severity: Maintainability suggestion (out of Brief 2 scope)**  
**Files:** [plugins.js](file:///d:/dev/motionpath/src/lib/plugins.js)  
**Found by: second review**

Five plugins (`positionPlugin`, `transformPlugin`, `opacityPlugin`, `colorPlugin`, `cssVarPlugin`) have byte-for-byte identical `contribute()` implementations. Only `filterPlugin` (writes `__${key}`) and `pathPlugin` (clamps into `__pathProgress`) actually differ.

Worth a single shared helper:
```js
function contributeDirectAssign(propertyKey, stops) {
  const percentPatch = {};
  stops.forEach(stop => {
    const pct = `${Math.round(stop.p * 100)}%`;
    percentPatch[pct] = percentPatch[pct] || {};
    percentPatch[pct][propertyKey] = stop.v;
    if (stop.ease) percentPatch[pct].ease = stop.ease;
  });
  return { percentPatch, tweenVars: {} };
}
```

Not in Brief 2's remit — a maintainability fix only, not a blocker.

---

## Action Summary

| # | Issue | Action | Owner |
|---|-------|--------|-------|
| 1 | `stagger.each` dead code | One-line fix in `builder.js` | Implementer |
| 2 | Ease-collision throw missing `propKey` | One-line fix in `builder.js` | Implementer |
| 3 | `resolveDirection` spec test cases absent | Add 4 exact test cases to `builder.test.js` | Implementer |
| 4 | Lazy-plugin concurrency test not exercising race | Fix test or add a direct `ensureLoaded` concurrent test | Implementer |
| 5 | `duration` field not in spec §5.8 | Pin the fallback chain in spec, then confirm or remove | Spec owner |
| 6 | `gsap.to(domNode)` vs proxy architecture | Clarify whether DOM node or proxy is correct target | Spec owner |
| — | Duplicate `contribute()` bodies | Refactor with shared helper (optional, non-blocking) | Implementer |

## What Both Reviews Confirmed as Correct

- ✅ `resolveDirection` logic and epsilon thresholds  
- ✅ Deep-merge of `percentPatch` per the spec's exact algorithm  
- ✅ Ease-collision check (defense-in-depth, §5.7)  
- ✅ `tweenVars` collision detection with same-value exemption (§5.6)  
- ✅ One `gsap.to()` per element — hard invariant honored (§5.8)  
- ✅ `loadPromises` Map is module-level, persists across calls (§3)  
- ✅ All timelines created with `paused: true` (scenarios and masters)  
- ✅ `primaryScenarioIndex` correctly recorded from `primary: true` field  
- ✅ Grouped scenarios added in schema-declaration order, no offset argument (§6)  
- ✅ All scenarios returned in `scenarios[]` whether grouped or not (§6)  
- ✅ §7 non-goals fully respected: no `ScrollTrigger`, `.play()`, `compose()`, `subscribe()`, or re-validation  
- ✅ `elementPlugins` Map populated and returned in `BuildResult`
