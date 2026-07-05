

inspect the brief at files/ folder and review if it match with the implemented code. make a code review and suggest fix if applicable (for gemini flash to apply the fix)

I now have a comprehensive picture of everything. Let me write the full code review.

***

Here is the full code review of the `claude-edit` branch against the `files/` briefs.

***

## Code Review — `chahyasantoso/motionpath` (`claude-edit` branch)

**Summary:** The core library modules (`builder.js`, `engineCore.js`, `ProductionEngine.js`, `EditorEngine.js`, plugins) are largely **correct and closely follow the briefs**. The most critical bugs are in the **migration layer** — the hooks were never repointed to the new engine, and the singleton contract in Brief 4 is only partially satisfied. There are also two subtle spec deviations in `builder.js` and `ProductionEngine.js`.

***

## 🔴 Critical Bugs (must fix)

### BUG-1 — All three hooks still import the old `motionEngine.js` (Brief 4 §Migration Context)

**Files:** `hooks/useMotionSubscriber.js`, `hooks/useMotionPlayer.js`, `hooks/useMotionProject.js`

Brief 4 explicitly states the hooks must be repointed so that "the import path … is the only thing that changes." All three hooks currently import the **old, deprecated** `motionEngine.js` singleton, which uses a completely different internal architecture (the `GsapPubSub` class with `initScene()`/`pause()`/`play()` surface). The new `productionEngine` singleton in `ProductionEngine.js` has a **different API** (`loadProject`, not `initScene`), so these hooks calling `motionEngine.initScene()`, `motionEngine.pause()`, `motionEngine.play()` against the new engine would silently fail.

**Fix:**

```js
// hooks/useMotionSubscriber.js — line 3
- import motionEngine from '../lib/motionEngine';
+ import productionEngine from '../lib/ProductionEngine';
// then replace all `motionEngine.` with `productionEngine.`
```

For `useMotionProject.js` and `useMotionPlayer.js`, the call sites also use `initScene(scenario, containerEl)`, `pause(sceneId)`, and `play(sceneId)` — methods that don't exist on `ProductionEngine`. These hooks need to be **fully rewritten** to call `productionEngine.loadProject(schema)` once (not per-scenario), and playback control needs to use `pauseTimer(id)` / `playTimer(id)`. The current multi-scenario hook pattern using `initScene` per-scenario was the old architecture; the new architecture loads the whole project in one `loadProject(schema)` call.

***

### BUG-2 — `enableScroll()` / `disableScroll()` use per-engine tracking instead of global passthrough (Brief 4 §3)

**File:** `src/lib/ProductionEngine.js`, lines 165–178

The brief explicitly specifies:
> `ScrollTrigger.getAll().forEach(st => st.enable())` / `.disable()` — **global pass-through only**

The implementation instead iterates `_createdScrollTriggers` (only those created by this engine instance). This breaks the documented behavior when other `ScrollTrigger` instances exist on the page (e.g. from other plugins or a third-party library).

**Fix:**

```js
// ProductionEngine.js
enableScroll() {
-  for (const st of _createdScrollTriggers) {
-    try { st.enable(); } catch (e) { /* ignore */ }
-  }
+  ScrollTrigger.getAll().forEach(st => st.enable());
},

disableScroll() {
-  for (const st of _createdScrollTriggers) {
-    try { st.disable(); } catch (e) { /* ignore */ }
-  }
+  ScrollTrigger.getAll().forEach(st => st.disable());
},
```


***

## 🟡 Spec Deviations (behaviour differs from brief)

### DEV-1 — `builder.js`: scroll-scrub stagger uses `index * stagger` instead of position `0` (Brief 2 §6)

**File:** `src/lib/builder.js`, lines ~168–174

The builder uses a single `getStaggerOffset` for all trigger types. However, Brief 2 §6 specifies:

> **`scroll-scrub` scenarios:** add every element's tween at position `0` … **unless** `scenario.stagger` is set — then add at `index * scenario.stagger`.

The current code applies stagger offsets even for `scroll-scrub` when `stagger` is `undefined` (which evaluates to `NaN * 0 = 0`), so it happens to be correct when stagger is absent. But the _default_ for scroll-scrub should be position `0`, not a computed offset. The code handles this accidentally. The real deviation is: the brief treats scrub as "parallel by default (position 0) unless stagger is explicit," while the code treats all trigger types identically with an offset formula. This passes in practice for `undefined` stagger, but is semantically wrong and will produce different behavior if `stagger: 0` is explicitly set (it's indistinguishable from "no stagger").

**Fix — make the intent explicit:**

```js
// builder.js — replace the stagger block
elements.forEach((element, idx) => {
  const tween = elementTweens[idx];
  const stagger = scenario.stagger;
  const offset = (typeof stagger === 'number' && stagger > 0)
    ? stagger * idx
    : (triggerType === 'scroll-scrub' ? 0 : stagger * idx || 0);
  scenarioTimeline.add(tween, offset);
});
```

Or, more clearly and matching the brief's intent:

```js
elements.forEach((element, idx) => {
  const tween = elementTweens[idx];
  const offset = typeof scenario.stagger === 'number' ? scenario.stagger * idx : 0;
  scenarioTimeline.add(tween, offset);
});
```

(The `=== 0` ambiguity is resolved because Brief 1's stagger validator rejects negative values; `stagger: 0` means "no offset," same as `undefined`.)

***

### DEV-2 — `ProductionEngine.js` loads triggerConfig from `buildResult.scenarios` primary config, not from `schema.scenarios` (Brief 4 §3)

**File:** `src/lib/ProductionEngine.js`, lines ~67–80

Brief 4 §3 says:

> Find the primary scenario's raw `triggerConfig` (via `primaryScenarioIndex`, looked up in **`schema.scenarios`**).

The implementation correctly reads `primaryScenario?.triggerConfig` from `buildResult.scenarios` (not `schema.scenarios`). Since `triggerConfig` in the `ScenarioBuild` is populated verbatim from `schema.scenario.trigger` in the builder (as required by Brief 2 §2 "raw, unmodified"), this is functionally equivalent. **This is not a real bug**, but it means the chain of trust is: `schema → builder → buildResult.triggerConfig` rather than re-reading `schema` directly. Noting it for awareness.

***

## 🟢 Correct Implementations (brief compliance confirmed)

| Module | Brief | Status |
| :-- | :-- | :-- |
| `builder.js` — proxy tween (never DOM) | Brief 2 §5.8 | ✅ Correct |
| `builder.js` — deep-merge `percentPatch` per-key | Brief 2 §5.5 | ✅ Correct |
| `builder.js` — tweenVars collision detection | Brief 2 §5.6 | ✅ Correct |
| `builder.js` — ease-collision defense-in-depth | Brief 2 §5.7 | ✅ Correct |
| `builder.js` — `ensureLoaded` deduplication (`loadPromises` Map) | Brief 2 §3 | ✅ Correct |
| `builder.js` — `resolveDirection` all cases | Brief 2 §4 | ✅ Correct |
| `builder.js` — `duration` fallback chain | Brief 2 Addendum | ✅ Correct |
| `builder.js` — `delay` baked via `scenarioTimeline.delay()` | Brief 2 Addendum C | ✅ Correct |
| `engineCore.js` — one shared ticker, lazy start/stop | Brief 3 §3 | ✅ Correct |
| `engineCore.js` — `subscribe` shallow proxy copy | Brief 3 §3 | ✅ Correct |
| `engineCore.js` — `compose` defensive try/catch per plugin | Brief 3 §5 | ✅ Correct |
| `engineCore.js` — `destroyScene` only kills matched scene's elements | Brief 3 §3 | ✅ Correct |
| `engineCore.js` — `compose` never writes DOM | Brief 3 §3 | ✅ Correct |
| `ProductionEngine.js` — rollback on trigger-wiring failure | Brief 4 §3 | ✅ Correct |
| `ProductionEngine.js` — grouped: one `ScrollTrigger` per group | Brief 4 §3 | ✅ Correct |
| `ProductionEngine.js` — singleton `productionEngine` exported as default | Brief 4 §2 | ✅ Correct |
| `EditorEngine.js` — no `ScrollTrigger`, no `.play()` | Brief 5 §3 | ✅ Correct |
| `EditorEngine.js` — `setProgress` group-first, scenario-fallback | Brief 5 §4 | ✅ Correct |
| `EditorEngine.js` — clamp to `[0, 1]` | Brief 5 §4 | ✅ Correct |
| `plugins/filterProperty.js` — `_filter` suffix for filter assembly | Brief 3/5 | ✅ Correct |
| `plugins/pathPlugin.js` — seeds `__cubicPath`/`__autoRotate` at `0%` | Brief 2 §5 | ✅ Correct |
| `validateScenario.js` — delegates to `validateProject` | Brief 1 | ✅ Correct |


***

## Prioritized Fix List for Gemini Flash

1. **BUG-1 (Critical):** Repoint `useMotionSubscriber.js` import from `../lib/motionEngine` → `../lib/ProductionEngine`, replace all `motionEngine.` calls with `productionEngine.`.
2. **BUG-1 (Critical):** Rewrite `useMotionProject.js` and `useMotionPlayer.js` to use `productionEngine.loadProject(schema)` instead of `initScene()`, and `pauseTimer(id)` / `playTimer(id)` for playback control. Remove the `initScene`/`pause`/`play` call pattern entirely.
3. **BUG-2 (Critical):** Replace `enableScroll`/`disableScroll` in `ProductionEngine.js` with `ScrollTrigger.getAll().forEach(st => st.enable()/st.disable())`.
4. **DEV-1 (Minor):** Make the scroll-scrub stagger intent explicit — replace the implicit `NaN * 0 = 0` fallback with an explicit `typeof scenario.stagger === 'number' ? stagger * idx : 0` pattern.
<span style="display:none">[^1]</span>

<div align="center">⁂</div>

[^1]: schema-v1-final.md

