# MotionPath — Implementation Brief 7: `useMotionTrigger` Hook (Removes `data-motion-id`)

## Context

`data-motion-id` / `document.querySelector` is used in exactly one place in the
whole engine today: `ProductionEngine.resolveTriggerRef`, resolving the
`trigger` / `startTrigger` / `pin` / `endTrigger` fields on scroll scenarios.
Animated elements (`element.id`) never go through it — `builder.js` builds a
pure proxy object per element (`gsap.to(proxy, {...})`) with zero DOM
dependency, and the DOM connection happens entirely via
`useMotionSubscriber(elementId, ref)`, a plain React ref supplied by whatever
component renders that element. That path is already fully DOM-decoupled and
requires no changes.

This brief replaces the *trigger-ref* resolution mechanism only. It does not
touch tween/timeline construction, which stays exactly as eager and
schema-driven as it is today.

## Non-goals (explicit)

- **No dynamic/lazy element or tween registration.** Timeline/tween
  construction remains fully eager, built once from the complete schema, and
  is never mutated after `ScrollTrigger.create()` has attached to it. This was
  investigated in depth (a browser spike proved late-appending to an
  attached scrub timeline retroactively rescales every sibling's proportional
  position, with no safe general fix — see `.agent/refresh-spike-protocol.md`
  and the accompanying findings) and is explicitly ruled out. Do not
  reintroduce anything resembling `registerInstance()`-driven proxy/tween
  construction.
- **No `triggerRefs` option on `useMotionProject`.** An earlier version of
  this plan used a flat ref-map option; it's superseded by the hook below.
  Do not add both.
- **No schema changes.** `trigger` / `startTrigger` / `pin` / `endTrigger`
  stay symbolic id strings, exactly as today. `data-motion-id` was never a
  schema concept — only an internal resolution strategy, which is what's
  changing.
- **No buffering/retry for missing trigger refs.** Unlike `subscribe()`'s
  race (safely recoverable — a late subscriber just gets replayed current
  state), there is no safe recovery for a missing trigger ref at wiring time.
  Retrying would mean delaying the one-time `ScrollTrigger.create()` call or
  mutating an already-attached timeline — both explicitly out of scope. Throw
  instead (see below).

## 1. New hook: `src/hooks/useMotionTrigger.js`

Symmetric to `useMotionSubscriber` in shape and lifecycle:

```js
import { useEffect } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * Registers a DOM ref as the resolution target for a trigger-anchor id
 * (used by `trigger` / `startTrigger` / `pin` / `endTrigger` in scenario
 * schemas). Replaces the old `data-motion-id` attribute + querySelector
 * lookup — this is a push registration instead of a DOM query.
 *
 * @param {string} id - matches the id string used in trigger/startTrigger/pin/endTrigger
 * @param {React.RefObject} ref
 */
export default function useMotionTrigger(id, ref) {
  useEffect(() => {
    if (!id || !ref) return undefined;
    productionEngine.registerTriggerRef(id, ref);
    return () => productionEngine.unregisterTriggerRef(id);
  }, [id, ref]);
}
```

## 2. `ProductionEngine.js` changes

Add a registry, independent of `_core`/`_buildResult`'s load/destroy
lifecycle (a trigger ref isn't tied to any one `loadProject()` cycle):

```js
const _triggerRefs = new Map(); // id -> React.RefObject

registerTriggerRef(id, ref) {
  _triggerRefs.set(id, ref);
},

unregisterTriggerRef(id) {
  _triggerRefs.delete(id);
},
```

Change the `resolveElement` dependency passed into `resolveTriggerRef` (or
the equivalent internal call site — check current signature before editing)
from:

```js
resolveElement: (id) => document.querySelector(`[data-motion-id="${id}"]`),
```

to:

```js
resolveElement: (id) => {
  const ref = _triggerRefs.get(id);
  if (!ref || !ref.current) {
    throw new Error(
      `MotionPath: trigger ref '${id}' is not registered. ` +
      `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
      `before this project's scenarios are wired.`
    );
  }
  return ref.current;
},
```

Keep the existing three-way dispatch in `resolveTriggerRef` unchanged
(`undefined`/`null` → fallback to `sceneId`, boolean passthrough for
`pin: true`, string → resolve via the function above) — only the resolution
function's implementation changes.

## 3. Per-demo-page migration

For every `data-motion-id="..."` attribute that is actually used as a
`trigger`/`startTrigger`/`pin`/`endTrigger` value somewhere in that page's
schema (check each page's scenario definitions — not every current
`data-motion-id` attribute is actually read by the engine; some are dead
markup left over from before this brief):

1. Add a `ref = useRef(null)` if the element doesn't already have one.
2. Call `useMotionTrigger('the-id', ref)` in the component.
3. Attach `ref={ref}` to the element.
4. Remove the `data-motion-id="..."` attribute.

For `data-motion-id` attributes that are **not** referenced by any
`trigger`/`startTrigger`/`pin`/`endTrigger` field in that page's schema (i.e.
purely on animated elements already wired via `useMotionSubscriber`), just
delete the attribute — it was never read by the engine.

After migration, confirm: `grep -rn "data-motion-id" src/` returns zero
results anywhere in the codebase.

## Verification checklist

1. Grep `src/` for `data-motion-id` — zero results.
2. Grep `ProductionEngine.js` for `querySelector` — zero results.
3. Behavioral test: a scenario with `pin: 'some-id'`, `useMotionTrigger`
   mounted with a real ref before `loadProject()` resolves — ScrollTrigger
   wires correctly (same behavior as the old querySelector path).
4. Behavioral test: `resolveElement` called for an id with no registered
   ref (or a ref whose `.current` is still `null`) — throws the exact error
   above, does not silently return `undefined` or a wrong element.
5. Behavioral test: `unregisterTriggerRef` actually removes the id from the
   map (a component that mounts, registers, unmounts, and never remounts
   should leave no dangling reference).
6. Full existing test suite (189 tests as of last count) still passes —
   this brief should not need to change `builder.js`, `engineCore.js`,
   `useMotionSubscriber.js`, or any validator.
7. Manually smoke-test each demo page (`/`, `/burst`, `/moto`,
   `/pasarmalam`, `/pasarmalam-observer`) — pins and cross-section
   `startTrigger`/`endTrigger` behavior should be visually identical to
   before migration.
