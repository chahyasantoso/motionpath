# MotionPath — Implementation Brief 6: Hook Layer (useMotionProject + useMotionSubscriber)

**Status:** Design-complete. Standalone spec.

**Precondition:** `ProductionEngine` (Brief 4, including Addendum B) is implemented and exported as the `productionEngine` singleton. This brief replaces `useMotionPlayer.js` and the existing `useMotionProject.js` draft — both call `motionEngine.initScene()` once per scenario, which is fundamentally incompatible with a singleton engine whose `loadProject()` replaces its entire previous state on every call (Brief 4 §5). Calling it three times, once per scenario, means the third call silently destroys the first two.

---

## 1. Purpose

Two hooks only. One loads a project once; one subscribes an element to broadcast updates. No per-scenario loader hook exists in the new design — that pattern is what caused the multi-scenario bug in the first place.

---

## 2. `useMotionProject(project)`

```js
import { useEffect, useRef } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

export default function useMotionProject(project) {
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;

    productionEngine.loadProject(projectRef.current).catch(err => {
      if (!cancelled) console.error('[useMotionProject] loadProject failed:', err);
    });

    return () => {
      cancelled = true;
      productionEngine.destroy();
    };
  }, [project]);
}
```

- **`project` must already be a complete, valid schema** (`{ schemaVersion, projectId, scenarios: [...] }`). This hook does no schema assembly — that's a page-level concern (§4), not a hook concern. A hook that builds schema shape would duplicate knowledge `validateProject`/`buildProject` already own.
- **No `containerRefMap` parameter.** `productionEngine`'s `resolveElement` dependency is a global `data-motion-id` lookup, not container-scoped — a ref-map here would be dead plumbing with nothing to consume it.
- **No `paused` option.** Neither current page (`BurstPage`, `DemoPage`) uses pause/play. `productionEngine.pauseTimer`/`playTimer` are already directly importable if a real need shows up later — the hook doesn't need to wrap them speculatively.
- Called **once per page**, not once per scenario.

---

## 3. `useMotionSubscriber(elementId, ref, transformFn)`

Unchanged in shape and behavior from the current implementation — only the import target changes:

```js
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { productionEngine } from '../lib/ProductionEngine'; // was: motionEngine

export default function useMotionSubscriber(elementId, ref, transformFn) {
  const transformFnRef = useRef(transformFn);
  transformFnRef.current = transformFn;

  useEffect(() => {
    if (!elementId || !ref) return;

    const unsubscribe = productionEngine.subscribe(elementId, (rawData) => {
      if (!ref.current) return;
      const activeTransformFn = transformFnRef.current;
      if (typeof activeTransformFn === 'function') {
        gsap.set(ref.current, activeTransformFn(rawData, (data) => productionEngine.compose(elementId, data)));
      } else {
        gsap.set(ref.current, productionEngine.compose(elementId, rawData));
      }
    });

    return unsubscribe;
  }, [elementId, ref]);
}
```

No other changes — the subscribe/compose contract is identical between `motionEngine` and `productionEngine` by design (Brief 4 §2 mirrors the old singleton's shape specifically so this swap is this small).

---

## 4. Required page-level restructuring (not a hook concern, but required for the hooks to work)

Both `BurstPage.jsx` and `DemoPage.jsx` currently call the loader hook once per scenario (`useMotionPlayer(strawberryScene, ...)`, `useMotionPlayer(iceCreamCardScene, ...)`, etc.). Each page needs one mechanical change: assemble its scenario consts into a single project object, and call `useMotionProject` once.

```js
// BurstPage.jsx — before:
useMotionPlayer(strawberryScene, containerRef);
useMotionPlayer(iceCreamCardScene, containerRef);

// after:
const project = {
  schemaVersion: 1,
  projectId: 'burst-page',
  scenarios: [strawberryScene, iceCreamCardScene],
};
useMotionProject(project);
```

If `project` is assembled inline on every render, wrap it in `useMemo` keyed on the scenario consts (or hoist it outside the component entirely if the scenarios are static module-level constants, which they currently are for both pages) — otherwise `useMotionProject`'s effect re-fires every render, tearing down and rebuilding the entire engine state unnecessarily.

**Markup requirement, per Brief 4 Addendum B:** every scene's container element needs `data-motion-id={scenario.sceneId}`, and any element referenced by a scrub scenario's `pin` or `endTrigger` as a string needs the same attribute — not a real DOM `id` or class selector. Example for `BurstPage`:

```jsx
<section data-motion-id={strawberryScene.sceneId} className="burst-scene">
  <div data-motion-id="burst-stage" className="burst-stage">
```
(matching `pin: '.burst-stage'` in the scenario becoming `pin: 'burst-stage'`, resolved via `data-motion-id` like every other element reference.)

---

## 5. Non-Goals

- No schema assembly logic inside `useMotionProject` — pages own their own project shape.
- No pause/play wrapper — not used anywhere today.
- No support for loading multiple independent projects simultaneously — `productionEngine` is a singleton by design (Brief 4); a page needing that would need a second, separate engine instance via `createProductionEngine()`, which is out of scope for this brief.
- Do not delete `useMotionPlayer.js`, the old `useMotionProject.js` draft, `motionEngine.js`, or `validateScenario.js` as part of this brief — that happens only after both pages are repointed and their existing tests pass against the new hooks (final step, §6).

---

## 6. Testing Requirements

- `useMotionProject`: renders with a valid project → `productionEngine.loadProject` called exactly once with that project; unmount → `productionEngine.destroy` called; project reference changes → old instance destroyed, new one loaded (standard effect-cleanup test pattern, mock `productionEngine`).
- `useMotionProject`: `loadProject` rejecting → does not throw synchronously in the component, error is logged (mock `console.error`, assert called).
- `useMotionSubscriber`: unchanged test suite from the existing implementation, just repointed to mock `productionEngine` instead of `motionEngine` — no new test cases needed, this hook's behavior didn't change.
- Integration: render `BurstPage` with the restructured project object, assert `productionEngine.loadProject` was called once (not twice), with a schema containing both `strawberryScene` and `iceCreamCardScene` in its `scenarios` array.

## 7. Final Cutover Step (do this last, after §6 passes)

1. Delete `hooks/useMotionPlayer.js` and the old `hooks/useMotionProject.js` draft.
2. Delete `lib/motionEngine.js` and `lib/validateScenario.js` — per the earlier decision to scrap and rebuild the editor separately, these have no remaining callers once `BurstPage`/`DemoPage` are repointed.
3. Delete `lib/__tests__/motionEngine.test.js` and `lib/validateScenario`'s test file, if present.
