# Brief 19 (revised) — `useMotionSubscribers`, with `useMotionSubscriber` as its N=1 case

## Context

Supersedes the previous draft of this brief. That draft extracted a shared `motionSubscriptionCore.js` used by two independent hook implementations. This version is simpler: `useMotionSubscribers` is the one real implementation; `useMotionSubscriber` becomes a thin wrapper that calls it with a single-element `sources` array. No shared core module, no two things to keep in sync.

## Locked decisions

- `useMotionSubscribers(sources, ref, mergeFn?)` is the only real implementation. `sources` is `Array<{ instance, trackId, transformFn? }>`.
- `useMotionSubscriber(instance, trackId, ref, transformFn)` becomes exactly this, in full:

  ```js
  import useMotionSubscribers from "./useMotionSubscribers.js";

  export default function useMotionSubscriber(
    instance,
    trackId,
    ref,
    transformFn,
  ) {
    useMotionSubscribers([{ instance, trackId, transformFn }], ref);
  }
  ```

  No `useRef`, no `useEffect`, no independent subscribe logic in this file. If you find yourself adding either back in, stop — that means the plural hook isn't doing its job.

- Resubscription in `useMotionSubscribers` is keyed on `instance.id` + `trackId` identity only, not array reference and not `transformFn` identity. A fresh `sources` array literal on every render (which is what the `useMotionSubscriber` wrapper now always produces) must not cause resubscribe churn as long as the underlying instance/trackId pairs are unchanged.
- Default merge with no `mergeFn`: `Object.assign({}, ...patches)` in array order — later sources win on overlapping keys.
- `transformFn` per source must always read the latest closure at tick time (ref-based array, one slot per source index), and must never be part of the resubscription signature.

## Non-goals

- Do not create a separate `motionSubscriptionCore.js` or any other shared module — this brief is specifically about not needing one.
- Do not optimize the N=1 path specially inside `useMotionSubscribers` (e.g. a fast path that skips the merge machinery for single-source calls). Keep it one code path for every source count — simplicity here matters more than micro-optimizing the common case.
- Do not change `useMotionSubscriber`'s public signature, JSDoc contract, or any existing call site (`SpiralBall.jsx`, PasarMalam, etc.).
- Do not add priority/ordering options beyond array order + optional `mergeFn`.
- Do not wire `useMotionSubscribers` into any component in this brief — this is hook-layer only.

---

## File 1 (new) — `src/hooks/useMotionSubscribers.js`

```js
import { useEffect, useRef } from "react";
import { domRenderer } from "../renderers/domRenderer.js";

function sourcesSignature(sources) {
  return sources
    .map((s) => `${s.instance?.id ?? ""}::${s.trackId ?? ""}`)
    .join("|");
}

function subscribeToTrack(instance, trackId, getTransformFn, onPatch) {
  if (!instance || !trackId) return () => {};

  const compose = (data) => instance.compose(trackId, data);

  return instance.subscribe(trackId, (rawData) => {
    const transformFn = getTransformFn();
    const patch =
      typeof transformFn === "function"
        ? transformFn(rawData, compose)
        : compose(rawData);
    onPatch(patch);
  });
}

/**
 * Merges N motion/track sources into one DOM write per tick. Each source may
 * have its own optional transformFn (same contract as the single-source
 * transformFn: receives (rawData, composeFn), returns a CSS patch). Every tick
 * from any one source re-merges all sources' latest composed patches and
 * writes once via domRenderer, so precedence on any property two sources both
 * touch is deterministic (array order, or a custom mergeFn) rather than
 * dependent on which source's GSAP timeline happens to tick first.
 *
 * @param {Array<{instance: MotionInstance, trackId: string, transformFn?: Function}>} sources
 * @param {React.RefObject} ref
 * @param {(patches: object[]) => object} [mergeFn] - defaults to Object.assign in array order (last wins)
 */
export default function useMotionSubscribers(sources, ref, mergeFn) {
  const transformFnsRef = useRef([]);
  transformFnsRef.current = sources.map((s) => s.transformFn);

  const mergeFnRef = useRef(mergeFn);
  mergeFnRef.current = mergeFn;

  const signature = sourcesSignature(sources);
  const signatureRef = useRef(signature);
  const stableSourcesRef = useRef(sources);
  if (signature !== signatureRef.current) {
    signatureRef.current = signature;
    stableSourcesRef.current = sources;
  }
  const stableSources = stableSourcesRef.current;

  useEffect(() => {
    if (!ref) return undefined;

    const latestPatches = stableSources.map(() => ({}));

    const applyMerged = () => {
      if (!ref.current) return;
      const merge =
        mergeFnRef.current ?? ((patches) => Object.assign({}, ...patches));
      domRenderer(ref.current, merge(latestPatches));
    };

    const unsubscribes = stableSources.map((source, i) =>
      subscribeToTrack(
        source.instance,
        source.trackId,
        () => transformFnsRef.current[i],
        (patch) => {
          latestPatches[i] = patch;
          applyMerged();
        },
      ),
    );

    return () => unsubscribes.forEach((fn) => fn());
  }, [ref, stableSources]);
}
```

### Verification for File 1 — spy-based, this is the important part

New test file `src/hooks/__tests__/useMotionSubscribers.test.js`:

1. **Merge correctness:** two sources, distinct `transformFn`s returning disjoint keys (e.g. `{x: 1}` and `{opacity: 0.5}`). Trigger a tick from source 0 only. Assert `domRenderer` was called with `{x: 1, opacity: 0.5}` — source 1's last-known patch carries even though only source 0 ticked.
2. **Override precedence, default merge:** two sources both returning `{opacity: ...}` with different values. Assert the final `domRenderer` call's `opacity` matches source 1 (later array position) regardless of which source ticked last.
3. **Custom `mergeFn`:** pass a `mergeFn` reversing precedence; assert its return value is exactly what `domRenderer` receives.
4. **Stability — critical test:** rerender the hook twice with a **new array literal** each time, same `instance.id`/`trackId` pairs in the same order. Spy on `instance.subscribe`; assert it was called exactly once per instance across both renders — no resubscription.
5. **Resubscription when it should happen:** rerender with a source's `trackId` actually changed. Assert the old unsubscribe function was called and `instance.subscribe` was called again with the new `trackId`.
6. **`transformFn` identity changes don't cause resubscription, but the latest one is used:** rerender twice with the same `instance`/`trackId` but a brand-new inline `transformFn` each time. Assert `instance.subscribe` was still only called once (per point 4), and assert the _second_ render's `transformFn` is the one actually invoked on the next tick.

---

## File 2 — `src/hooks/useMotionSubscriber.js` (replace entirely)

**WRONG is the current file** (already in the codebase — diff against it, don't paste it here). **CORRECT — full replacement:**

```js
import useMotionSubscribers from "./useMotionSubscribers.js";

/**
 * Smart Subscriber Hook — Listens to coordinate broadcasts from a MotionInstance
 * and applies them directly to a DOM element via domRenderer, bypassing
 * React's Virtual DOM entirely (Zero Re-render).
 *
 * A thin single-source wrapper over useMotionSubscribers — see that hook for
 * the underlying implementation and multi-source composition.
 *
 * @param {MotionInstance} instance - The active MotionInstance object
 * @param {string} trackId - ID of the track to subscribe to (matches tracks[].id in motion JSON)
 * @param {React.RefObject} ref - React ref to the target DOM element
 * @param {Function} [transformFn] - Optional transform function. Receives data (rawData)
 *   and compose function (rawData => patch) and must return an object of CSS properties for domRenderer.
 */
export default function useMotionSubscriber(
  instance,
  trackId,
  ref,
  transformFn,
) {
  useMotionSubscribers([{ instance, trackId, transformFn }], ref);
}
```

### Verification for File 2

- Run the existing `useMotionSubscriber.test.js` **unmodified**. Every test must still pass. If any test needs a change to pass, this wrapper changed observable behavior — stop and report, do not edit the test to make it pass.
- Add one new test confirming the wrapper's `instance.subscribe` call count matches direct `useMotionSubscribers` usage with an equivalent single-element array (proves the wrapper isn't accidentally double-subscribing or behaving differently from the thing it delegates to).

---

## Final verification (after both files)

1. Fresh clone, `npm install`, `npx vitest run` — all prior tests green including `useMotionSubscriber.test.js` with zero edits to that test file, plus all new tests from Files 1 and 2 passing.
2. `grep -rn "motionSubscriptionCore" src` — zero matches anywhere (confirms no stray shared-core module got created).
3. `wc -l src/hooks/useMotionSubscriber.js` — should be small (roughly 15-20 lines including JSDoc); if it's noticeably larger, logic leaked back into the wrapper that belongs in `useMotionSubscribers.js` only.
4. `grep -rln "useMotionSubscribers" src` — matches should be only the new hook file, its test file, and `useMotionSubscriber.js`'s import. Confirms nothing else was wired up in this brief.
