I now have a comprehensive view of all briefs and all implemented code. Here is the full code review:

***

## Code Review: `claude-edit` branch vs. `files/` Briefs

The implementation is **largely correct and well-structured**. The module separation (builder → engineCore → ProductionEngine/EditorEngine) faithfully follows the brief layering. Below are all findings, organized by severity.

***

## 🔴 Critical Bugs

### 1. `builder.js` — Proxy seed reads from `percentPatch['0%']`, not from the merged `sharedKeyframes`

**File:** [`src/lib/builder.js`](https://github.com/chahyasantoso/motionpath/blob/claude-edit/src/lib/builder.js), lines ~89–93

**Brief rule:** Addendum A states the `p:0` seed stop must flow through the **normal merge path** in §5 — specifically through `sharedKeyframes` — so the existing deep-merge and collision-detection logic catches any future key conflicts automatically.

**What the code does instead:** it extracts `percentPatch['0%']` from a single plugin's contribution *before* deep-merging, then writes keys directly into `proxy` — bypassing the merge entirely:

```js
// CURRENT — reads from one plugin's patch before merge, skips collision check
const zeroFrame = percentPatch['0%'] ?? {};
for (const [pKey, pVal] of Object.entries(zeroFrame)) {
  if (pKey !== 'ease' && !(pKey in proxy)) proxy[pKey] = pVal;
}
```

If two plugins contribute different values to `proxy` at `0%` (e.g. `x`), the `if (!(pKey in proxy))` guard means the second plugin's value silently wins — no collision check fires. Addendum A explicitly calls this out as the structural gap.

**Fix — seed proxy from `sharedKeyframes['0%']` after the full merge loop completes:**

```js
// After the full propKeys loop, seed proxy from the fully merged 0% frame
const mergedZero = sharedKeyframes['0%'] ?? {};
for (const [k, v] of Object.entries(mergedZero)) {
  if (k !== 'ease') proxy[k] = v;
}
```

Remove the per-property seed block entirely. The collision detection in the merge loop already handles conflicts correctly.

***

### 2. `builder.js` — `loadPromises` Map is module-level and never cleared

**File:** [`src/lib/builder.js`](https://github.com/chahyasantoso/motionpath/blob/claude-edit/src/lib/builder.js), lines ~26–33

**Brief rule (§3):** "Cache the load with a **module-level promise**" — the brief intends this for deduplication *within a build pass*, but the current `Map` keyed on plugin *object identity* means it persists across hot-module-reloads or test runs where the plugin object is re-instantiated.

**Observed test consequence:** the test `'sequential buildProject calls do not re-invoke load() for the same plugin'`  *relies on* this persistence and passes — but if the plugin object is recreated between test suites, a dangling entry for the old object reference leaks. This is low-severity in production (plugins are singletons), but the test is asserting the wrong thing: it should assert idempotency *within one build*, not across test-module lifetimes.

**Fix (minimal):** document the intentional cross-call persistence explicitly in a comment, and reset the Map in `beforeEach` in tests that test isolation:

```js
// In builder.test.js beforeEach:
import { _resetLoadPromises } from '../builder.js'; // export a test-only reset
_resetLoadPromises(); // clear between test cases so lazy plugin tests are independent
```


***

## 🟡 Medium Issues

### 3. `engineCore.js` — `destroyScene` re-kills the group's `masterTimeline` for every scenario in the group

**File:** [`src/lib/engineCore.js`](https://github.com/chahyasantoso/motionpath/blob/claude-edit/src/lib/engineCore.js), lines ~95–102

**Brief rule (§3):** "Kill every GSAP timeline in `buildResult.scenarios` whose `sceneId` matches, **including removing it from any `timelineGroups` master timeline it was nested in**."

**Problem:** if two scenarios share the same `timelineId` and both match the `sceneId`, `group.masterTimeline.kill()` is called twice. GSAP's `.kill()` is idempotent, so it won't crash — but it is semantically incorrect and kills the master even if *other* scenarios in the group belong to a *different* `sceneId` that was not destroyed.

**Fix:**

```js
const groupsToKill = new Set();
for (const scenario of matchingScenarios) {
  scenario.timeline?.kill();
  if (scenario.timelineId) groupsToKill.add(scenario.timelineId);
}
for (const id of groupsToKill) {
  // Only kill master if ALL child scenarios in the group are being destroyed
  const allMatch = buildResult.scenarios
    .filter(s => s.timelineId === id)
    .every(s => matchingScenarios.includes(s));
  if (allMatch) buildResult.timelineGroups.get(id)?.masterTimeline?.kill();
}
```


***

### 4. `engineCore.js` — `compose()` passes `elementBuild` (not `elementConfig`) as second arg to `plugin.compose()`

**File:** [`src/lib/engineCore.js`](https://github.com/chahyasantoso/motionpath/blob/claude-edit/src/lib/engineCore.js), line ~75

**Brief rule (§3):** "`plugin.compose(rawData, elementConfig)`" — the second argument should be the schema element config object (the `element` object from the schema), not the `ElementBuild` object `{ proxy, domNode }`.

The current call:

```js
contribution = plugin.compose(source, elementBuild); // ← elementBuild = { proxy, domNode }
```

should be:

```js
contribution = plugin.compose(source, elementBuild.elementConfig); // ← raw schema element
```

**However**, `ElementBuild` as defined in Brief 2 does not include `elementConfig`. The builder needs to also store the raw schema element config:

```js
// In builder.js, when building elementsMap:
elementsMap.set(element.id, { proxy, domNode, elementConfig: element });
```

Then in `engineCore.js`:

```js
contribution = plugin.compose(source, elementBuild.elementConfig ?? elementBuild);
```


***

### 5. `ProductionEngine.js` — `destroy()` does not call `ScrollTrigger.getAll()` scoped to created triggers

**File:** [`src/lib/ProductionEngine.js`](https://github.com/chahyasantoso/motionpath/blob/claude-edit/src/lib/ProductionEngine.js), `_cleanup()`

The `_cleanup()` function correctly iterates `_createdScrollTriggers` to kill only owned STs. But `enableScroll()`/`disableScroll()` call `ScrollTrigger.getAll()` — the global list — which violates Brief 4 §5's note that if multiple engine instances coexist, global enable/disable affects unrelated instances.

**Fix:**

```js
enableScroll() {
  for (const st of _createdScrollTriggers) st.enable();
},
disableScroll() {
  for (const st of _createdScrollTriggers) st.disable();
},
```


***

### 6. `EditorEngine.js` — missing guard on `subscribe`/`compose`/`destroyScene` when `_core` is null

**File:** [`src/lib/EditorEngine.js`](https://github.com/chahyasantoso/motionpath/blob/claude-edit/src/lib/EditorEngine.js)

`ProductionEngine.js` has the same issue but it's more critical in `EditorEngine` since it's used in UI contexts where the order of calls is less controlled. Calling `engine.subscribe()` before `loadProject()` will throw `Cannot read properties of null (reading 'subscribe')`.

**Fix — add guard:**

```js
subscribe(elementId, callback) {
  if (!_core) throw new Error('EditorEngine: loadProject() must be called before subscribe().');
  return _core.subscribe(elementId, callback);
},
```


***

## 🟢 Minor Issues / Missing Tests

### 7. `builder.test.js` — proxy-not-DOM test misses the Addendum A case

**Brief rule (§9 Addendum A):** "add a test using a property whose real stops do **not** include a `p≈0` entry … assert the resulting `sharedKeyframes['0%']` contains the natural value."

The test `'seeds proxy with natural value at p=0 when stops start after p=0'`  checks `proxy.opacity === 1` (correct), but does **not** assert that `sharedKeyframes['0%'].opacity` also equals 1 (which is what proves the seed went through the merge path). This test currently passes even with the buggy direct-proxy-write path from Issue \#1 above.

**Fix — add assertion:**

```js
const tween = result.scenarios[^0].timeline.getChildren()[^0];
expect(tween.vars.keyframes['0%']?.opacity).toBe(1); // proves it's in the merged keyframes
```


### 8. `engineCore.test.js` — ticker lifecycle "last unsubscribe stops ticker" is not tested

**Brief rule (§6):** "subscribe, unsubscribe (not destroy) — same assertion, since the lazy-stop condition must also fire correctly on last-unsubscribe."

The test `'adds and removes gsap.ticker callback'`  does test unsubscribe, but the assertion only checks `removeSpy.toHaveBeenCalledWith(tickerFn)`. It doesn't verify that `tickerCallback` is set to `null` (so a re-subscribe triggers `startTicker()` again correctly). Add a follow-up subscribe after unsubscribe and assert `addSpy` is called a second time.

### 9. `motionEngine.js` is still present and untouched

**Brief 4 migration context:** "`motionEngine.js` and `validateScenario.js` are deleted only after the hook is repointed here and existing tests pass." The file still exists at [`src/lib/motionEngine.js`](https://github.com/chahyasantoso/motionpath/blob/claude-edit/src/lib/motionEngine.js) . This is acceptable per the spec's migration gate — it should be tracked as a pending deletion once `useMotionSubscriber.js` is repointed.

***

## Summary for Gemini Flash

| \# | Severity | File | What to Fix |
| :-- | :-- | :-- | :-- |
| 1 | 🔴 Critical | `builder.js` | Remove per-property proxy seed block; instead seed `proxy` from `sharedKeyframes['0%']` after the full merge loop |
| 2 | 🔴 Medium | `builder.js` | Export `_resetLoadPromises()` for test isolation; document cross-call persistence |
| 3 | 🟡 Medium | `engineCore.js` | `destroyScene` — only kill master timeline if ALL of its child scenarios are being destroyed |
| 4 | 🟡 Medium | `builder.js` + `engineCore.js` | Store `elementConfig` in `ElementBuild`; pass it (not `elementBuild`) as second arg to `plugin.compose()` |
| 5 | 🟡 Medium | `ProductionEngine.js` | Scope `enableScroll`/`disableScroll` to `_createdScrollTriggers`, not global `getAll()` |
| 6 | 🟡 Medium | `EditorEngine.js` (+ `ProductionEngine.js`) | Guard `subscribe`/`compose`/`destroyScene` with null-check on `_core` |
| 7 | 🟢 Minor | `builder.test.js` | Add `tween.vars.keyframes['0%']` assertion in Addendum A seed test |
| 8 | 🟢 Minor | `engineCore.test.js` | Test that re-subscribing after last-unsubscribe re-adds ticker |
| 9 | 🟢 Info | `motionEngine.js` | Pending deletion after `useMotionSubscriber` is repointed |

<span style="display:none">[^1]</span>

<div align="center">⁂</div>

[^1]: schema-v1-final.md

