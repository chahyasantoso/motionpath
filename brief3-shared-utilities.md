# MotionPath — Shared Utilities for Brief 3 & Brief 4

**Audience:** AI coding agent (Gemini Flash) implementing directly against `lib/builder.js`'s `BuildResult` output.
**Read this file first.** Both Brief 3 (ProductionEngine) and Brief 4 (EditorEngine) depend on the two utilities defined here. Implement this file's contents BEFORE starting either brief.

---

## §0 — Warning: known failure modes for fast/cheap models on this task

Gemini Flash tends to produce code that passes tests but silently violates architecture. On this specific brief, watch for these exact failure patterns, seen before on this project:

1. **Duplicating logic instead of importing the shared helper.** If you find yourself writing "resolve timelineId, else find scenario by sceneId" inline inside ProductionEngine.js or EditorEngine.js, STOP — that logic belongs in `timelineResolver.js`, imported, not re-derived. Two copies of the same resolution logic is exactly the failure mode already caught and fixed once in this project (validator signature-shim duplication, Round 3).

2. **Building a unified `MotionEngine` interface object that doesn't exist.** ProductionEngine and EditorEngine do NOT share a method surface. Do not create a common base class, do not create a shared "MotionEngine" wrapper object, do not make method names symmetric for symmetry's sake. They both call the same two utilities in this file — that is the ONLY thing they share. See "Why no unified interface" below.

3. **Letting compose() call subscribe() or vice versa.** These are two independent, separately-callable functions. `subscribe()` delivers raw proxy values on every tick. `compose()` is called explicitly, separately, whenever a DOM patch is needed. Do not have one call the other internally — that would silently double-apply DOM writes.

4. **Writing `filter` directly from an individual plugin's compose step.** All filter-family proxy fields (`__blur`, `__brightness`, `__contrast`, `__saturate`) must be consolidated into ONE `filter` string inside the shared `compose()` function, never written individually to `domNode.style.filter`. If you see more than one code path setting `.style.filter`, that is a bug — stop and re-read this section.

5. **Silent no-op on unknown target.** `resolveTimeline()` must THROW on an unresolvable target, never return `null`/`undefined` and let the caller silently do nothing. A silent no-op looks like working code in a demo and fails invisibly later.

If you are uncertain whether something belongs in the shared utilities file vs. an engine file, put it in the shared utilities file. Duplication across engines is the default wrong answer.

---

## Why no unified interface

`ProductionEngine` and `EditorEngine` consume the same `BuildResult`, but they do not expose matching methods, and this is intentional, not an oversight:

- `ProductionEngine` owns real playback: ScrollTrigger, `.play()`, timer/scroll enable-disable (architecture §9).
- `EditorEngine` owns preview-only scrubbing: `.progress()`/`.seek()` only, no triggers, no autoplay (architecture §10 — "isolated canvas only").

These are genuinely different responsibilities with no meaningful 1:1 method mapping (there is no EditorEngine equivalent of `enableScroll`, and no ProductionEngine equivalent of `setProgress`). Forcing a shared interface class would require either stub methods that throw "not supported" (bad UX, hides bugs) or lowest-common-denominator methods that lose type safety and specificity (also bad). **Do not build a `MotionEngine` base class or wrapper.** The two engines are related only by consuming the same `BuildResult` and calling the same two shared utilities below.

---

## BuildResult contract (read-only in this brief — do not modify builder.js)

```js
{
  elementPlugins: Map<elementId, Plugin[]>,
  elements: Map<elementId, { proxy, domNode }>,
  scenarios: [{ scenarioIndex, sceneId, triggerType, triggerConfig, timeline, isPrimary, timelineId? }],
  timelineGroups: Map<timelineId, { timelineId, triggerType, masterTimeline, primaryScenarioIndex }>
}
```

Do not add fields to this shape. Do not modify `lib/builder.js` in Brief 3 or Brief 4. If something you need isn't in `BuildResult`, that's a signal to re-read this contract, not to reach into builder internals.

---

## Shared utility 1 — `lib/timelineResolver.js`

**Purpose:** resolve a `target` string (a `sceneId` or `timelineId`) to the one timeline object that should be acted on. Both engines call this. Write it once.

```js
export function resolveTimeline(target, buildResult) {
  const group = buildResult.timelineGroups.get(target);
  if (group) return group.masterTimeline;

  const scenario = buildResult.scenarios.find(s => s.sceneId === target);
  if (scenario) return scenario.timeline;

  throw new Error(`resolveTimeline: no group or scenario found for target "${target}".`);
}
```

**CORRECT:**
```js
const timeline = resolveTimeline('berryScene-master', buildResult);
timeline.progress(0.5);
```

**WRONG — do not inline this logic inside an engine file:**
```js
// WRONG: duplicated resolution logic inside ProductionEngine.js
let timeline = buildResult.timelineGroups.get(target)?.masterTimeline;
if (!timeline) {
  timeline = buildResult.scenarios.find(s => s.sceneId === target)?.timeline;
}
```
Both engines must `import { resolveTimeline } from './timelineResolver.js'` and call it. No exceptions.

**File:** `lib/timelineResolver.js`
**Tests:** `lib/__tests__/timelineResolver.test.js`
- Grouped target resolves to `masterTimeline`.
- Ungrouped `sceneId` resolves to that scenario's own `timeline`.
- Unknown target throws (assert with `expect(() => ...).toThrow()`, not a truthy/falsy check).

---

## Shared utility 2 — `lib/compose.js`

**Purpose:** turn an element's raw proxy state into (a) raw tick broadcasts for subscribers, and (b) a consolidated DOM patch. These are two separate exported functions — do not merge them into one.

```js
// lib/compose.js

export function subscribe(elementId, buildResult, callback) {
  // Attach an onUpdate-style tick hook to the element's owning tween.
  // On every tick, call callback(proxy) with the RAW proxy object — no
  // filter consolidation, no DOM writes, no calling compose() internally.
  // Return an unsubscribe function.
}

export function compose(elementId, buildResult) {
  const { proxy, domNode } = buildResult.elements.get(elementId);

  const filterParts = [];
  if ('__blur' in proxy) filterParts.push(`blur(${proxy.__blur}px)`);
  if ('__brightness' in proxy) filterParts.push(`brightness(${proxy.__brightness})`);
  if ('__contrast' in proxy) filterParts.push(`contrast(${proxy.__contrast})`);
  if ('__saturate' in proxy) filterParts.push(`saturate(${proxy.__saturate})`);
  // If none of the above keys are present on proxy, do not write filter at all
  // (leave domNode.style.filter untouched) — do not write an empty string.

  if (filterParts.length > 0) {
    domNode.style.filter = filterParts.join(' ');
  }

  if ('__pathProgress' in proxy) {
    // Resolve __pathProgress + the element's static path.points via
    // getPointOnCubicPath() into {x, y, z, rotation} and apply to domNode
    // (via gsap.set or direct style, matching however other transform
    // properties are already being applied elsewhere in this codebase —
    // check plugins.js for the existing pattern before inventing a new one).
  }

  // Any remaining proxy keys that map 1:1 to real CSS/GSAP properties
  // (x, y, opacity, rotation, etc.) are applied directly — they do not
  // need consolidation, only the filter-family and path need special handling.
}
```

**CORRECT — one filter write per compose() call, only when filter keys exist:**
```js
if (filterParts.length > 0) {
  domNode.style.filter = filterParts.join(' ');
}
```

**WRONG — do not let subscribe() auto-compose:**
```js
// WRONG
export function subscribe(elementId, buildResult, callback) {
  tween.eventCallback('onUpdate', () => {
    compose(elementId, buildResult); // NO — compose is a separate, explicit call
    callback(proxy);
  });
}
```

**WRONG — do not write filter per-property:**
```js
// WRONG: two separate writes to filter, second one clobbers the first
domNode.style.filter = `blur(${proxy.__blur}px)`;
domNode.style.filter = `brightness(${proxy.__brightness})`;
```

**File:** `lib/compose.js`
**Tests:** `lib/__tests__/compose.test.js`
- `compose()` with only `__blur` present → `style.filter === 'blur(Npx)'`, nothing else touched.
- `compose()` with `__blur` AND `__brightness` present → single combined `filter` string containing both, in the order shown above.
- `compose()` with no filter-family keys present → `style.filter` is never assigned (assert it stays at its prior value, e.g. `undefined` or whatever it was before the call — do not assert it equals `''`).
- `subscribe()` calls `callback` with the raw proxy object (assert callback received the proxy reference or an equivalent raw snapshot, NOT a DOM patch shape).
- `subscribe()` returns an unsubscribe function; calling it stops further callback invocations (advance the tween after unsubscribing, assert callback call count did not increase).
