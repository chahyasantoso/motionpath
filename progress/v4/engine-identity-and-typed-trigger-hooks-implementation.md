# Plan: Engine Instance Identity Fix + Typed Trigger Hooks

## Context

`Engine.#instances` is keyed by schema `motionId`, so mounting the same motion twice destroys the first instance. The trigger ref system (`TriggerRefRegistry` + `useMotionTrigger` + string IDs in schemas) adds indirection that breaks when multiple instances of the same motion coexist. This refactor fixes both by: (1) keying instances by a unique counter-based ID, (2) replacing the string-ID trigger system with typed hooks that inject real DOM refs directly.

Brief: `progress/v4/engine-identity-and-typed-trigger-hooks-brief.md`

---

## Step 0 — Verification gate

Run the grep checks from the brief's Step 0. Confirm:
- `#instances` keyed by `motion.id` (schema id) — to be fixed
- `mountInstance` has dedupe-and-destroy branch — to be removed
- `unmountInstance` has zero callers — to be deleted
- `ScrollTriggerDelegate.build(resolveElement)` has string branches — to be simplified
- 12 `useMotionTrigger` call sites total; only DemoPage (6) and PasarMalamPage (2) are in-scope

Run `npx vitest run` — all tests must pass before starting.

## Step 1 — `Engine.js` core refactor

**File:** `src/engines/Engine.js`

Changes:
- Remove `TriggerRefRegistry` import and `#triggerRefs` field
- Add `#instanceCounter = 0`
- Extract `#mountMotionWithDelegate(motionConfig, delegate)` — generates unique `motion-${++counter}` ID, builds Motion + tracks, calls `motion.init()` (no args), stores in `#instances`
- Sets `motion.motionId = motionConfig.id` as reference-only property
- Simplify `mountInstance` — no dedupe-and-destroy branch; motion path delegates to `#mountMotionWithDelegate`; standalone-track path unchanged
- Add `mountWithDelegate(motionId, delegate)` — public entry for typed hooks
- Delete `unmountInstance`, `registerTriggerRef`, `unregisterTriggerRef`, `resolveElement`

## Step 2 — `Motion.js` — drop `resolveElement` from `init()`

**File:** `src/lib/Motion.js`

Change `init(resolveElement)` → `init()`. Change `this.trigger.build(resolveElement)` → `this.trigger.build()`. One-line signature change + one-line call change.

## Step 3 — `TriggerDelegate.js` — simplify `ScrollTriggerDelegate.build()`

**File:** `src/lib/TriggerDelegate.js`

- `build()` drops `resolveElement` parameter
- Remove all `typeof x === 'string' ? resolveElement(x) : x` branches
- `trigger` reads directly from `this.#config.trigger` (now a real DOM element)
- `pin: true` resolves to the trigger element; `pin` as element passes through; falsy = no pin
- `endTrigger` reads directly (already a real element or undefined)
- `TimeTriggerDelegate.build()` / `ManualTriggerDelegate.build()` — unchanged (already no param)

## Step 4 — Create new hooks

### `src/hooks/useScrollMotion.js` (new)

Accepts nullable `schema` (the motion schema object, e.g. `scrollScene`). Returns `{ refs, instance }`.
- Creates `triggerRef`, `pinRef`, `endTriggerRef` unconditionally (Rules of Hooks)
- Effect deps: `[schema?.id]` — guards with `if (!schema?.id || !triggerRef.current) return`
- Builds `ScrollTriggerDelegate` with real DOM elements from refs
- Calls `engine.mountWithDelegate(schema.id, delegate)`
- Cleanup: `motion.destroy()`
- `refs` object: `{ trigger: triggerRef, pin: pinRef (if schema has pin role), endTrigger: ... }`

### `src/hooks/useTimeMotion.js` (new)

Thin wrapper around `useMotionInstance`. Returns `{ instance }`.

### `src/hooks/useManualMotion.js` (new)

Wraps `useMotionInstance`, adds `seek(p)` convenience. Returns `{ instance, seek }`.

## Step 5 — Migrate schemas (remove string trigger IDs)

### `DemoPage.jsx` schemas

All three scenes (`scrollScene`, `dynamicCarouselScene`, `dynamicHelixScene`):
- Remove `trigger: 'xxx-scroll-trigger'` from the trigger config
- Change `pin: 'xxx-stage-pin'` → `pin: 'pin'` (role-string: separate pin element)

### `PasarMalamPage.jsx` schema

`pasarMalamScene`:
- Remove `trigger: 'pasar-malam-storytelling'` from the trigger config
- Change `pin: 'pm-stage'` → `pin: 'pin'`

## Step 6 — Migrate `DemoPage.jsx` consumers

Three scene wrappers (`ScrollDemo`, `CarouselDemo`, `HelixDemo`) each own their trigger refs, so `useScrollMotion` moves INTO each wrapper:

```
ScrollDemo({ isLoaded })                    // receives isLoaded from DemoPage
  useScrollMotion(isLoaded ? scrollScene : null) → { refs, instance }
  <section ref={refs.trigger}>
    <div ref={refs.pin}>
```

`DemoPage` changes:
- Remove all 3 `useMotionInstance` calls
- Pass `isLoaded` to each scene wrapper instead of `instance`
- Remove `useMotionTrigger` import

Each scene wrapper:
- Remove `useMotionTrigger` calls and manual `containerRef`/`stageRef`
- Replace with `useScrollMotion`, use `refs.trigger` and `refs.pin`
- The `instance` variable comes from the hook return, not props

Child components (`Rocket`, `Cloud`, `CarouselCard`, `HelixCard`) continue receiving `instance` as a prop — the scene wrapper passes it down the same way.

## Step 7 — Migrate `PasarMalamPage.jsx` consumers

Both motions live in the top-level component:

- Replace `useMotionTrigger` calls + `useMotionInstance(isLoaded ? 'pasar-malam-storytelling' : null)` with:
  `const { refs, instance: storytellingInstance } = useScrollMotion(isLoaded ? pasarMalamScene : null)`
- Replace `useMotionInstance(isLoaded ? 'lantern-bounce' : null, BOUNCE_CONFIG)` with:
  `const { instance: bounceInstance } = useTimeMotion(isLoaded ? 'lantern-bounce' : null, BOUNCE_CONFIG)`
- Update JSX refs: `storytellingRef` → `refs.trigger`, `stageRef` → `refs.pin`
- Remove `useMotionTrigger` import, manual ref declarations for trigger/pin

## Step 8 — Delete dead code

- Delete `src/hooks/useMotionTrigger.js`
- Delete `src/lib/TriggerRefRegistry.js`
- Verify: `BurstPage.jsx` and `PasarMalamObserverPage.jsx` still import `useMotionTrigger` — leave them alone (stale v3, out of scope). They'll get a broken import which is acceptable since they're already non-functional.

**Decision needed:** the brief says to delete `useMotionTrigger.js` outright even though BurstPage/PasarMalamObserverPage import it. This will cause import errors in those files. The brief explicitly says those files are "already non-functional under v4 regardless" and out of scope. We should follow the brief.

## Step 9 — Update tests

**File:** `src/engines/__tests__/Engine.test.js`

- Existing `getTrack` tests: `mountInstance('swarm-motion')` now returns a Motion with a unique instance ID (`motion-1`), NOT `'swarm-motion'`. `getTrack('swarm-motion')` will return null because the key is now `'motion-1'`. The standalone-track tests are unaffected (still keyed by schema id).
- Fix: the `mountInstance` test that checks `getTrack('standalone-track')` is fine (standalone path unchanged). The motion-based test calling `mountInstance('swarm-motion')` doesn't use `getTrack` on the motion id, so likely fine. Verify.
- Add: concurrent instance test — `mountWithDelegate` twice for same motionId, both alive.
- Add: `mountInstance` no longer destroys previous instance test.

## Step 10 — Verification

1. `npx vitest run` — all tests pass
2. Grep checks from the brief's §6:
   - No `existing.destroy` / dedupe in Engine
   - No `unmountInstance` anywhere
   - No string trigger ids in DemoPage/PasarMalamPage schemas
   - No `useMotionTrigger` import in DemoPage/PasarMalamPage
   - `TriggerRefRegistry.js` and `useMotionTrigger.js` deleted
   - BurstPage/PasarMalamObserverPage untouched
3. Manual browser test: DemoPage scroll scenes + PasarMalamPage scroll+bounce

---

## Files changed (summary)

| File | Action |
|---|---|
| `src/engines/Engine.js` | Refactor: unique IDs, shared helper, `mountWithDelegate`, delete registry methods |
| `src/lib/Motion.js` | `init()` drops `resolveElement` param |
| `src/lib/TriggerDelegate.js` | `ScrollTriggerDelegate.build()` drops string resolution |
| `src/hooks/useScrollMotion.js` | New |
| `src/hooks/useTimeMotion.js` | New |
| `src/hooks/useManualMotion.js` | New |
| `src/components/Demo/DemoPage.jsx` | Migrate 3 scroll motions to `useScrollMotion` |
| `src/components/PasarMalam/PasarMalamPage.jsx` | Migrate 1 scroll + 1 time motion |
| `src/engines/__tests__/Engine.test.js` | Update + add concurrent instance tests |
| `src/hooks/useMotionTrigger.js` | Delete |
| `src/lib/TriggerRefRegistry.js` | Delete |

**Not touched:** BurstPage, MotorcyclePage, PasarMalamObserverPage, SpiralPage, any test files outside Engine.test.js.
