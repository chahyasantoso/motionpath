# Revision Report — Builder Fix Pass

Post-review fixes applied to `src/lib/builder.js`, `src/lib/plugins.js`, and `src/lib/__tests__/builder.test.js`.  
All changes confirmed passing: **17/17 tests**.

---

## Changes by File

### [builder.js](file:///d:/dev/motionpath/src/lib/builder.js)

#### Fix A1 — Stagger one-liner

Removed the dead `stagger.each` object branch that contradicted Brief 1's locked decision to reject object-form stagger at the validator level.

```diff
-const getStaggerOffset = (stagger, idx) => {
-  if (!stagger) return 0;
-  if (typeof stagger === 'number') return stagger * idx;
-  if (typeof stagger === 'object' && typeof stagger.each === 'number') {
-    return stagger.each * idx;
-  }
-  return 0;
-};
+const getStaggerOffset = (stagger, idx) =>
+  typeof stagger === 'number' ? stagger * idx : 0;
```

#### Fix A2 — Ease-collision error message now includes property key

Brief 2 §8 requires element id **and** property key in every throw. The `percentKey` alone wasn't enough to locate the offending property without bisecting.

```diff
-throw new Error(
-  `Ease collision on element "${element.id}" at percent "${percentKey}": ` +
-  `different eases found ("${existing.ease}" vs "${incoming.ease}").`
-);
+throw new Error(
+  `Ease collision on element "${element.id}" at percent "${percentKey}" ` +
+  `(contributed by property "${propKey}"): ` +
+  `different eases found ("${existing.ease}" vs "${incoming.ease}").`
+);
```

#### Fix A4 — `ensureLoaded` exported

Required so the concurrency test (below) can call it directly with `Promise.all` without going through the sequential element loop.

```diff
-function ensureLoaded(plugin) {
+export function ensureLoaded(plugin) {
```

#### Fix B1 — Duration documented (chain kept as-is)

The fallback chain `element.duration → trigger.duration → 1` was already correct. Added an explicit comment documenting it as an authorized addendum to §5.8, along with the reasoning (GSAP's 0.5s default breaks percent-keyframe animations).

```js
// Duration fallback chain — authorized addendum to §5.8:
// Without an explicit duration, GSAP defaults to 0.5s which silently
// breaks all percent-keyframe animations. Chain:
//   element.duration  → per-element override (highest priority)
//   trigger.duration  → scenario-level (e.g. TriggerTime.duration)
//   1                 → final fallback (safe default)
const tweenDuration = element.duration ?? scenario.trigger?.duration ?? 1;
```

#### Fix B2 — Tween targets a proxy object, not the DOM node

**The core architectural fix.** `gsap.to(domNode, ...)` replaced with `gsap.to(proxy, ...)`. The DOM node is still resolved, but only for `getNaturalValue()`. The tween target is a plain `{}` object per element.

This is required because `filterPlugin` writes `__blur` / `__brightness` (not valid CSS) and `pathPlugin` writes `__pathProgress` — neither key does anything useful when set directly on a DOM node. The engine's `onUpdate → plugin.compose(proxy)` layer is responsible for translating proxy state into real CSS.

**Proxy seeding approach:** Rather than special-casing `filterPlugin` or `pathPlugin` by reference (as `motionEngine.js` does), the builder calls `plugin.contribute(propKey, [{p:0, v:naturalValue}])` as a synthetic seed. The resulting `percentPatch['0%']` reveals the exact proxy key(s) the plugin uses, without the builder needing to know about `__` prefix conventions:

```js
const proxy = {};
// ...inside propKey loop:
const seed = plugin.contribute(propKey, [{ p: 0, v: naturalValue }], element);
const seedFrame = seed?.percentPatch?.['0%'] ?? {};
for (const [pKey, pVal] of Object.entries(seedFrame)) {
  if (pKey !== 'ease' && !(pKey in proxy)) proxy[pKey] = pVal;
}
// ...
const tween = gsap.to(proxy, { keyframes: sharedKeyframes, ...sharedTweenVars, duration: tweenDuration, paused: true });
```

The proxy is accessible to the engine via `tween.targets()[0]` — no new fields added to `BuildResult`.

Also consolidated: the previous code called `deps.resolveElement(element.id)` twice per element (once inside the propKey loop for `getNaturalValue`, once outside for the tween). Now called once at the top of the element loop.

---

### [plugins.js](file:///d:/dev/motionpath/src/lib/plugins.js)

#### Fix C1 — Extracted shared `contributeDirectAssign` helper

Five plugins (`positionPlugin`, `transformPlugin`, `opacityPlugin`, `colorPlugin`, `cssVarPlugin`) had byte-for-byte identical `contribute()` implementations. Extracted into one module-private function:

```js
function contributeDirectAssign(propertyKey, stops) {
  const percentPatch = {};
  stops.forEach(stop => {
    const pct = `${Math.round(stop.p * 100)}%`;
    if (!percentPatch[pct]) percentPatch[pct] = {};
    percentPatch[pct][propertyKey] = stop.v;
    if (stop.ease) percentPatch[pct].ease = stop.ease;
  });
  return { percentPatch, tweenVars: {} };
}
```

Each of the five plugins now uses `contribute: contributeDirectAssign`. `filterPlugin` (writes `__${key}`) and `pathPlugin` (writes `__pathProgress`, clamps to `[0,1]`) keep their custom implementations.

Net reduction: **~55 lines removed** from `plugins.js`.

---

### [builder.test.js](file:///d:/dev/motionpath/src/lib/__tests__/builder.test.js)

#### Fix A3 — Four spec-mandated `resolveDirection` test cases added

Brief 2 §4 says *"Test cases (must pass exactly)"* for these exact inputs. Added as named tests inside the existing `resolveDirection` describe block:

| Input | Expected output |
|---|---|
| `[{p:0,v:10}], undefined, 0` | `[{p:0,v:10},{p:1,v:0}]` |
| `[{p:1,v:10}], undefined, 0` | `[{p:0,v:0},{p:1,v:10}]` |
| `[{p:0,v:10},{p:1,v:20}], "fromTo", 0` | same array ref (`toBe`) |
| `[{p:0.0007,v:5}], undefined, 0` | `[{p:0.0007,v:5},{p:1,v:0}]` |

#### Fix A4 — Lazy-plugin tests replaced with proper concurrency tests

The old test ran two elements through a sequential `for...of` / `await` loop — element 2 only starts after element 1's `ensureLoaded` resolves, so there is no actual race. It would have passed even with the buggy boolean-flag implementation.

Replaced with two tests:

**1. Direct concurrency test** (the actual race condition):
```js
it('concurrent ensureLoaded calls for the same plugin fire load() exactly once', async () => {
  const lazyPlugin = {
    lazy: true,
    load: vi.fn(() => new Promise(resolve => setTimeout(resolve, 20)))
  };
  // Both fire before either resolves — this is the real race
  await Promise.all([ensureLoaded(lazyPlugin), ensureLoaded(lazyPlugin)]);
  expect(lazyPlugin.load).toHaveBeenCalledTimes(1);
});
```

**2. Cross-call persistence test** (module-level Map survives multiple `buildProject` calls):
```js
it('sequential buildProject calls do not re-invoke load() for the same plugin', async () => {
  await buildProject(project, deps);
  await buildProject(project, deps);
  expect(lazyPlugin.load).toHaveBeenCalledTimes(1);
});
```

---

## Test Results

```
✓ resolveDirection > stops.length >= 2: returns stops unchanged
✓ resolveDirection > stops.length === 1, p near 0: returns expanded stops
✓ resolveDirection > stops.length === 1, p near 1: returns expanded stops
✓ resolveDirection > spec §4: [{p:0,v:10}], undefined, 0
✓ resolveDirection > spec §4: [{p:1,v:10}], undefined, 0
✓ resolveDirection > spec §4: two stops returned unchanged regardless of direction arg
✓ resolveDirection > spec §4: [{p:0.0007,v:5}] treated as p≈0 (within epsilon 0.001)
✓ merge pipeline > two properties contributing to different percent keys
✓ merge pipeline > two properties contributing to the same percent key, different props
✓ merge pipeline > two properties contributing conflicting tweenVars values: throws
✓ merge pipeline > two properties contributing the same tweenVars key, same value: does not throw
✓ merge pipeline > throws on ease collision at same percent key
✓ lazy plugin loading > concurrent ensureLoaded calls fire load() exactly once
✓ lazy plugin loading > sequential buildProject calls do not re-invoke load()
✓ scenario and group > applies stagger offsets correctly
✓ scenario and group > grouped scenarios nest sequentially and record primaryScenarioIndex
✓ end-to-end compile with real plugins

Test Files: 1 passed (1)
    Tests: 17 passed (17)
```

---

## Open Items

Two items from the review remain open — both require spec owner input, not code:

| # | Issue | Status |
|---|-------|--------|
| B1 | Duration fallback chain (`element.duration → trigger.duration → 1`) not in §5.8 | Documented in code as authorized addendum; should be added to spec formally |
| B2 | §5.8 literal says `domNode` but proxy is correct for filter/path | Resolved by decision; spec text should be updated to say `proxy` |
