# Brief 19 — `useMotionSubscribers`: multi-source track composition

## Context

Two ad hoc patterns currently exist for a component that needs more than one motion/track source driving a single DOM node: (a) calling `useMotionSubscriber` twice, which writes via two independent `domRenderer` calls with no guaranteed precedence on any CSS property both sources touch; (b) calling `companionInstance.compose(trackId)` directly inside a `transformFn`, which works but hardcodes a specific external instance into what should be a small, reusable, pure per-track function. This brief adds a proper third option and removes the need for either workaround going forward. It does not require migrating any existing call site — `useMotionSubscriber` keeps its current public signature and behavior unchanged.

## Locked decisions

- New hook is `useMotionSubscribers` (plural), a sibling to `useMotionSubscriber`, not a modification of it.
- Signature: `useMotionSubscribers(sources, ref, mergeFn?)` where `sources` is `Array<{ instance, trackId, transformFn? }>`.
- Default merge behavior with no `mergeFn` given: `Object.assign({}, ...patches)` in array order — later sources in the array win on any overlapping key. This must be the literal default, not left unhandled.
- Resubscription must be keyed on `instance.id` + `trackId` identity only, **not** array reference and **not** `transformFn` identity. A caller passing a fresh `sources` array literal every render, with the same underlying instances/trackIds, must not cause repeated subscribe/unsubscribe churn.
- `transformFn` per source must always read the latest closure at tick time (ref-based), exactly matching how `useMotionSubscriber` already handles its own `transformFn` today — do not make `transformFn` part of any dependency array or stability signature.
- Extract the shared "subscribe to one track, run transform-or-compose" logic into a new framework-agnostic module so both hooks use one implementation. `useMotionSubscriber`'s observable behavior (including its `if (!ref.current) return;` guard and its exact JSDoc contract) must not change.

## Non-goals

- Do not add priority/ordering options beyond array order + optional `mergeFn`. No config object beyond the three documented parameters.
- Do not memoize or validate `sources` shape beyond what's needed for the signature comparison — no prop-types-style runtime validation.
- Do not touch any existing call site of `useMotionSubscriber` (`SpiralBall.jsx`, PasarMalam, etc.) — this brief only adds the new hook and the internal DRY extraction. Migrating a specific component to use `useMotionSubscribers` is a separate, future decision.
- Do not add support for a source's `instance` or `trackId` changing independently mid-array-position in a way that needs partial resubscription — the whole subscription set resubscribes together when the signature changes. Partial/incremental resubscription is out of scope.

---

## File 1 (new) — `src/hooks/motionSubscriptionCore.js`

Framework-agnostic shared core. No React imports here.

```js
/**
 * Subscribes to one motion track and reports each composed patch via onPatch.
 * Framework-agnostic (no React, no DOM writes) — callers own timing and rendering.
 * getTransformFn is called on every tick so callers can hand back the latest
 * closure without this function needing to know about React refs.
 *
 * @param {MotionInstance} instance
 * @param {string} trackId
 * @param {() => Function|undefined} getTransformFn
 * @param {(patch: object) => void} onPatch
 * @returns {() => void} unsubscribe — always callable, no-ops safely if instance/trackId were missing
 */
export function subscribeToTrack(instance, trackId, getTransformFn, onPatch) {
  if (!instance || !trackId) return () => {};

  const compose = (data) => instance.compose(trackId, data);

  return instance.subscribe(trackId, (rawData) => {
    const transformFn = getTransformFn();
    const patch = typeof transformFn === 'function' ? transformFn(rawData, compose) : compose(rawData);
    onPatch(patch);
  });
}
```

### Verification for File 1
- New test file `src/hooks/__tests__/motionSubscriptionCore.test.js`: mock `instance.subscribe`/`instance.compose`, assert `onPatch` receives the transformFn's return value when a transformFn is given, and `instance.compose(trackId, rawData)`'s return value when it isn't. Assert `subscribeToTrack(null, 'x', ...)` and `subscribeToTrack(instance, null, ...)` both return a callable no-op without throwing.

---

## File 2 — `src/hooks/useMotionSubscriber.js` (refactor only, behavior unchanged)

**WRONG is the current file** (shown in full in the codebase already — do not paste it here, just diff against it). **CORRECT:**

```js
import { useEffect, useRef } from 'react';
import { domRenderer } from '../renderers/domRenderer.js';
import { subscribeToTrack } from './motionSubscriptionCore.js';

/**
 * Smart Subscriber Hook — Listens to coordinate broadcasts from a MotionInstance
 * and applies them directly to a DOM element via domRenderer, bypassing
 * React's Virtual DOM entirely (Zero Re-render).
 *
 * @param {MotionInstance} instance - The active MotionInstance object
 * @param {string} trackId - ID of the track to subscribe to (matches tracks[].id in motion JSON)
 * @param {React.RefObject} ref - React ref to the target DOM element
 * @param {Function} [transformFn] - Optional transform function. Receives data (rawData)
 *   and compose function (rawData => patch) and must return an object of CSS properties for domRenderer.
 */
export default function useMotionSubscriber(instance, trackId, ref, transformFn) {
  const transformFnRef = useRef(transformFn);
  transformFnRef.current = transformFn;

  useEffect(() => {
    if (!instance || !trackId || !ref) {
      return undefined;
    }

    const unsubscribe = subscribeToTrack(instance, trackId, () => transformFnRef.current, (patch) => {
      if (!ref.current) return;
      domRenderer(ref.current, patch);
    });

    return unsubscribe;
  }, [instance, trackId, ref]);
}
```

### Verification for File 2
- Run the existing `useMotionSubscriber.test.js` unmodified — every test must still pass with zero changes to the test file itself. If any test needs a change to pass, the refactor changed observable behavior and is wrong — stop and report, do not edit the test to make it pass.

---

## File 3 (new) — `src/hooks/useMotionSubscribers.js`

```js
import { useEffect, useRef } from 'react';
import { domRenderer } from '../renderers/domRenderer.js';
import { subscribeToTrack } from './motionSubscriptionCore.js';

function sourcesSignature(sources) {
  return sources.map(s => `${s.instance?.id ?? ''}::${s.trackId ?? ''}`).join('|');
}

/**
 * Like useMotionSubscriber, but merges N motion/track sources into one DOM write.
 * Each source may have its own optional transformFn (same contract as
 * useMotionSubscriber's transformFn). Every tick from any source re-merges all
 * sources' latest composed patches and writes once via domRenderer — so ordering
 * between sources is deterministic (array order, or a custom mergeFn), unlike
 * calling useMotionSubscriber multiple times on the same ref.
 *
 * @param {Array<{instance: MotionInstance, trackId: string, transformFn?: Function}>} sources
 * @param {React.RefObject} ref
 * @param {(patches: object[]) => object} [mergeFn] - defaults to Object.assign in array order (last wins)
 */
export default function useMotionSubscribers(sources, ref, mergeFn) {
  const transformFnsRef = useRef([]);
  transformFnsRef.current = sources.map(s => s.transformFn);

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
      const merge = mergeFnRef.current ?? ((patches) => Object.assign({}, ...patches));
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
        }
      )
    );

    return () => unsubscribes.forEach((fn) => fn());
  }, [ref, stableSources]);
}
```

### Verification for File 3 (all behavioral, spy-based — this is the important part)

New test file `src/hooks/__tests__/useMotionSubscribers.test.js`:

1. **Merge correctness:** two sources, each with a distinct `transformFn` returning disjoint keys (e.g. `{x: 1}` and `{opacity: 0.5}`). Trigger a tick from source 0 only. Assert `domRenderer` was called with `{x: 1, opacity: 0.5}` — i.e. source 1's last-known patch is carried even though only source 0 ticked.
2. **Override precedence, default merge:** two sources both returning `{opacity: ...}` with different values. Assert the final `domRenderer` call's `opacity` matches source 1 (later array position), regardless of which source ticked last — proves precedence is array-order-deterministic, not tick-order-dependent.
3. **Custom `mergeFn`:** pass a `mergeFn` that reverses precedence; assert its return value is what `domRenderer` receives, unmodified.
4. **Stability — the critical test:** render the hook twice (via `rerender` in `@testing-library/react-hooks` or equivalent) passing a **new array literal** each time but with the same `instance.id`/`trackId` pairs in the same order. Spy on `instance.subscribe` for each instance; assert `subscribe` was called exactly once per instance across both renders (i.e., no resubscription happened). This is the test that actually proves the signature-comparison logic works — do not skip it or replace it with a shallower assertion.
5. **Resubscription when it should happen:** render once, then rerender with a source's `trackId` actually changed. Assert the old subscription's unsubscribe function was called and a new `instance.subscribe` call happened with the new `trackId`.
6. **`transformFn` identity changes don't cause resubscription:** render twice with the same `instance`/`trackId` but a brand-new inline `transformFn` each time. Assert `instance.subscribe` was still only called once (matches point 4), and assert the *second* render's `transformFn` is the one actually invoked on the next tick (proves the ref-based "always latest" read works, not just that no resubscribe happened).

---

## Final verification (after all three files)

1. Fresh clone, `npm install`, `npx vitest run` — all prior tests green with zero modifications to `useMotionSubscriber.test.js`, plus new tests from Files 1 and 3 passing.
2. `grep -n "instance.compose(trackId, data)" src/hooks/useMotionSubscriber.js` — should have moved into `motionSubscriptionCore.js`; zero direct occurrences left in `useMotionSubscriber.js` itself.
3. Do not wire `useMotionSubscribers` into any component in this brief — confirm via `grep -rln "useMotionSubscribers" src` that the only matches are the new hook file itself and its test file.
