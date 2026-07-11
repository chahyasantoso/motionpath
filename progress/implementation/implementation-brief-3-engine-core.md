# MotionPath — Implementation Brief 3: Engine Core (Shared)

**Status:** Design-complete. Standalone spec.

**Precondition:** consumes a `BuildResult` already produced by `buildProject` (Brief 2). Does not validate, does not build, does not touch `ScrollTrigger` or `.play()`.

**Why this brief exists as its own module, not folded into Brief 4:** the code review of `motionEngine.js` found two independent, drifted implementations of plugin resolution and `contribute()` — a real bug, not a style issue, caused by not sharing this logic. `subscribe()`/`compose()` are exactly the kind of logic `ProductionEngine` and `EditorEngine` would otherwise be tempted to each reimplement slightly differently. This module exists once; both engines compose it.

---

## 1. Purpose

Given a `BuildResult`, provide the one shared implementation of: broadcasting raw per-element proxy values every tick, composing DOM-ready patches via plugin `compose()`, and cleaning up GSAP objects on scene/engine teardown.

---

## 2. Public Interface

```ts
type UnsubscribeFn = () => void;

interface EngineCore {
  subscribe(elementId: string, callback: (rawState: Record<string, unknown>) => void): UnsubscribeFn;
  compose(elementId: string, rawData?: Record<string, unknown>): Record<string, unknown>;
  destroyScene(sceneId: string): void;
  destroy(): void;
}

function createEngineCore(buildResult: BuildResult): EngineCore
```

- Pure composition target — `ProductionEngine` and `EditorEngine` each hold one `EngineCore` instance internally and delegate these four methods to it directly. Neither engine re-implements any of this.

---

## 3. Behavior

### `subscribe(elementId, callback)`

- Broadcasts **raw** proxy values — no plugin `compose()` involved here, that's a separate call (§ below).
- Implementation: **one shared `gsap.ticker` callback**, not one per element and not one per subscriber. On each tick, for every `elementId` that currently has at least one subscriber, call each subscriber with a shallow copy of that element's current `proxy` object (`{ ...proxy }` — never pass the live proxy reference itself, so a subscriber mutating its copy can't corrupt GSAP's tween target).
- **Lazy start/stop, not always-on:** start the ticker callback only when the first subscriber (across all elements) is added; remove it entirely when the last subscriber (across all elements) is removed. An idle ticker callback with zero subscribers is wasted work on every frame — cheap to avoid, worth avoiding.
- Returns an unsubscribe function that removes only that specific callback for that specific `elementId`.
- If `elementId` doesn't exist in `buildResult.elements`, throw synchronously (`Error` with the elementId in the message) — this is a caller bug (subscribing to a nonexistent element), not a runtime condition to swallow silently.

### `compose(elementId, rawData?)`

- `rawData` optional — if omitted, use the element's current live `proxy` state.
- Look up `buildResult.elementPlugins.get(elementId)`. For each resolved plugin that has a `compose` method, call `plugin.compose(rawData, elementConfig)` and `Object.assign` the results into one patch object, in plugin-resolution order.
- Return the merged patch. **This function does not write anything to the DOM itself** — it returns a plain object; whatever calls it (a React hook, `ProductionEngine`'s own internal `gsap.set()` wiring if any) is responsible for applying it. Keeping `compose()` a pure function here (schema/proxy in, patch object out) is what makes it independently testable without a real DOM.

### `destroyScene(sceneId)`

- Kill every GSAP timeline in `buildResult.scenarios` whose `sceneId` matches (`.kill()`), including removing it from any `timelineGroups` master timeline it was nested in.
- Remove all subscribers for every element belonging to that scene's scenarios. Do not touch elements belonging to other scenes.

### `destroy()`

- Kill every timeline and tween this `EngineCore` knows about (`buildResult.scenarios[].timeline`, every `timelineGroups[].masterTimeline`).
- Clear every subscriber, for every element.
- Remove the shared ticker callback entirely, unconditionally — this is the one place a leftover reference would cause a real memory/CPU leak (a ticker callback that outlives its `EngineCore` instance keeps running forever). See §5.

---

## 4. Non-Goals

- No `ScrollTrigger` creation, no `.play()`/`.pause()` — `ProductionEngine`'s job (Brief 4).
- No `.progress()`/`.seek()` calls — `EditorEngine`'s job (Brief 5).
- No plugin resolution or `contribute()` logic — already done by `buildProject` (Brief 2); this module only reads `buildResult.elementPlugins`, never resolves plugins itself.
- No schema validation, no rebuilding — this module only ever receives one already-built `BuildResult` for its whole lifetime. A schema change means constructing a new `EngineCore` (and new `ProductionEngine`/`EditorEngine`), not mutating this one in place.

---

## 5. Security & Robustness

- **The lazy-ticker lifecycle (§3) is the one real leak risk in this module** — if `destroy()` fails to remove the shared ticker callback, or if `subscribe()`'s start-condition and `destroy()`'s stop-condition ever drift out of sync, the callback runs forever even after the engine is discarded, silently consuming CPU on every animation frame indefinitely. Test this explicitly (§6) — don't just test that `destroy()` runs without throwing.
- `compose(elementId, rawData)` must defensively handle a plugin's `compose()` throwing — wrap each plugin's call in its own try/catch, skip that plugin's contribution on failure, continue merging the rest, rather than letting one broken plugin blank out an otherwise-valid patch for every other property on the element.

---

## 6. Testing Requirements

- `subscribe` — register a callback, advance a built tween's `.progress()`, assert the callback fires on the next tick with the updated proxy values; unsubscribe, advance further, assert no further calls.
- **Ticker lifecycle test (critical):** subscribe once, call `destroy()`, then assert `gsap.ticker`'s listener count returned to its pre-subscribe count (proves no dangling callback). Also test: subscribe, unsubscribe (not destroy) — same assertion, since the lazy-stop condition must also fire correctly on last-unsubscribe, not only on `destroy()`.
- `compose` — mock two plugins both contributing to the merged patch, assert both contributions present; mock a plugin whose `compose()` throws, assert the other plugin's contribution is still present in the result (proves the defensive try/catch in §5).
- `destroyScene` — build a two-scene project, destroy one scene, assert its timelines are killed and its elements have no subscribers, while the other scene's timeline and subscribers are untouched.

---

## Addendum A — Deferred Subscribe (fixes a real mount-order race condition)

**Problem found in production:** React fires child effects before parent effects. A page's child components (e.g. `Strawberry`) mount and call `useMotionSubscriber` → `subscribe()` **before** the parent page's `useMotionProject` effect has even started `loadProject()`'s async work. `ProductionEngine`/`EditorEngine`'s current guard (`if (!_core) throw`) fires on every real page load, not occasionally — this is not an edge case, it is the normal mount order for any page with child subscribers.

**Fix: buffer subscriptions that arrive before `EngineCore` exists, flush them once it does.** This is shared logic both `ProductionEngine` and `EditorEngine` need identically — same reasoning that justified `EngineCore` existing as its own module rather than being duplicated. New file, not a change to `createEngineCore` itself (this wraps the *absence* of a core, not the core's own behavior).

```js
// lib/deferredSubscribe.js
export function createDeferredSubscribe() {
  let core = null;
  let pending = [];

  return {
    setCore(newCore) {
      core = newCore;
      const toFlush = pending;
      pending = [];
      for (const entry of toFlush) {
        if (!entry.cancelled) {
          entry.realUnsubscribe = core.subscribe(entry.elementId, entry.callback);
        }
      }
    },
    clearCore() {
      core = null;
      pending = [];
    },
    subscribe(elementId, callback) {
      if (core) return core.subscribe(elementId, callback);
      const entry = { elementId, callback, cancelled: false, realUnsubscribe: null };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
        if (entry.realUnsubscribe) entry.realUnsubscribe();
        pending = pending.filter(e => e !== entry);
      };
    },
  };
}
```

**Integration — both `ProductionEngine.js` and `EditorEngine.js`:**
- Construct one `createDeferredSubscribe()` instance at module scope (per engine instance, not global).
- In `loadProject()`, immediately after `_core = createEngineCore(buildResult)` succeeds, call `deferredSubscribe.setCore(_core)`.
- On `loadProject()` failure (existing rollback path) and in `destroy()`, call `deferredSubscribe.clearCore()`.
- **Delete the `if (!_core) throw` guard in `subscribe()` entirely.** Replace the method body with `return deferredSubscribe.subscribe(elementId, callback);` — `subscribe()` no longer needs to know or care whether `_core` exists yet.
- `compose()` keeps its existing `if (!_core) return {}` behavior, unchanged — it was already correct, this addendum only fixes `subscribe()`.

**Why not a React-side fix (context/ready-signal/polling):** the race isn't a React problem, it's an async-producer-with-early-consumers problem — the same shape regardless of which UI framework calls these engines. Fixing it at the engine boundary means `useMotionSubscriber` needs zero changes and keeps working exactly as already specified in Brief 6; no hook needs to know initialization is asynchronous.

**Unmount-before-ready is already handled:** if a subscribing component unmounts while its entry is still pending, the returned unsubscribe marks it `cancelled` before flush — the flush step skips cancelled entries, so no dangling callback is ever created for an already-unmounted component.

**Non-goals:** do not add a "ready" event/callback for external code to await — nothing needs one, since every subscriber's own return value already unsubscribes correctly whether it was live or buffered at the time. Do not change `EngineCore`'s own `subscribe()` implementation — this wraps engines, not the core.

**Testing requirements:**
- `subscribe()` called before `loadProject()` resolves → returns an unsubscribe function, does not throw, does not call `EngineCore.subscribe` yet.
- Once `loadProject()` resolves → the buffered callback receives its replayed initial state (proving Round 3's synchronous-replay-on-subscribe still fires correctly for buffered subscriptions, not just immediate ones).
- Unsubscribing a still-pending entry, then letting `loadProject()` resolve → `EngineCore.subscribe` is never called for that entry (proves cancellation is honored, not just accepted).
- `destroy()` while subscriptions are pending → no error, no stray calls into a now-nonexistent core.

---

## Addendum B — Load Generation Guard (supersedes the three deviations found in `bug_report.md`; reverts `deferredSubscribe.js` to Addendum A's original form)

**Root cause, confirmed against the actual bug report:** React StrictMode's double-invoke means `loadProject()` can be called twice in quick succession, each starting an independent async `buildProject()` pipeline, with no mechanism to detect that a first call has been superseded by a second before it resolves. The three deviations found in review (never clearing `pending`, auto-resubscribing an `active` set on every `setCore`, swallowing `subscribe()` errors) were each patching a symptom of overlapping loads, not the cause — and one of them (swallowing errors) directly caused Bug 2 in the report to fail silently instead of surfacing. **None of the three deviations are correct. All three are reverted by this addendum.**

### 1. `deferredSubscribe.js` — revert to exactly Addendum A's original form

```js
export function createDeferredSubscribe() {
  let core = null;
  let pending = [];

  return {
    setCore(newCore) {
      core = newCore;
      const toFlush = pending;
      pending = [];
      for (const entry of toFlush) {
        if (!entry.cancelled) {
          entry.realUnsubscribe = core.subscribe(entry.elementId, entry.callback);
        }
      }
    },
    clearCore() {
      core = null;
      pending = [];
    },
    subscribe(elementId, callback) {
      if (core) return core.subscribe(elementId, callback);
      const entry = { elementId, callback, cancelled: false, realUnsubscribe: null };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
        if (entry.realUnsubscribe) entry.realUnsubscribe();
        pending = pending.filter(e => e !== entry);
      };
    },
  };
}
```

**No `active` set. No `try/catch` around `core.subscribe()`.** A nonexistent `elementId` must throw synchronously through this module, unmodified — that throw is load-bearing (it's what would have surfaced Bug 2 immediately as a real stack trace instead of a silently-lost subscription).

### 2. `ProductionEngine.js` and `EditorEngine.js` — add a load generation guard in `loadProject`

Both engines have the identical race window — this must be applied to both, not just one:

```js
async loadProject(schema) {
  const loadId = ++this._loadGeneration; // instance field, starts at 0

  const errors = validateProject(schema);
  if (errors.some(e => e.severity === 'error')) {
    throw new Error(errors.filter(e => e.severity === 'error').map(e => e.message).join('\n'));
  }

  const buildResult = await buildProject(schema, deps);

  if (loadId !== this._loadGeneration) {
    // A newer loadProject() call started while this one was still building.
    // This build is stale — discard it completely, never wire it up, never
    // touch this._core or deferredSubscribe. The newer call owns the engine.
    for (const scenario of buildResult.scenarios) scenario.timeline?.kill();
    for (const group of buildResult.timelineGroups.values()) group.masterTimeline?.kill();
    return;
  }

  this._core = createEngineCore(buildResult);
  deferredSubscribe.setCore(this._core);
  // ... existing trigger-wiring (ProductionEngine) or nothing further (EditorEngine)
}
```

`destroy()` should also increment `_loadGeneration` before tearing down, so any in-flight `loadProject()` call that resolves afterward is treated as stale and discarded via the same check above — this prevents a load started before `destroy()` was called from reviving a core after intentional teardown.

**Scoping rule, found necessary in production:** `deferredSubscribe.clearCore()` must only ever be called from `destroy()` (or the stale-load discard branch above) — **never** from a shared "cleanup" helper that also runs on a normal successful commit. A commit-path cleanup helper's job is limited to killing old GSAP timeline/ScrollTrigger objects before wiring the new ones; clearing the subscription registry is a `destroy()`-only concern. Merging the two into one shared function wipes pending subscriptions that children buffered while the async build was in flight, so `setCore()` has nothing left to flush on a normal, successful load. If a single "cleanup" function currently serves both the commit path and `destroy()`, split it: the shared part stays shared (killing stale GSAP objects), `clearCore()` moves out and is called only from `destroy()` itself.

## Non-Goals

- Do not add support for "reload a project while components stay mounted" as a first-class feature. This guard fixes overlapping *load attempts* generally (StrictMode, rapid re-navigation, or any other cause) — it does not mean the engine now supports hot-swapping schemas under live subscribers as a supported use case. Brief 6 still scopes `useMotionProject` to one stable load per page mount.
- Do not reintroduce an `active` set, resubscription logic, or error-swallowing in `deferredSubscribe.js` under any framing. If a future real bug seems to need one of these, treat that as a signal to re-examine the generation guard first, not to re-add the deviation.

## Testing Requirements

- Call `loadProject(schemaA)`, then immediately `loadProject(schemaB)` before the first resolves (mock `buildProject` with controllable/delayed promises) → assert schemaA's build result timelines are killed and never wired to `_core`/`deferredSubscribe`, and schemaB's build is the one that ends up active.
- Call `loadProject(schema)`, then `destroy()` before it resolves → once the pending `loadProject` resolves, assert nothing is wired (no `_core` set, no ScrollTrigger created).
- Regression test reproducing the exact StrictMode sequence from `bug_report.md` (mount → subscribe → unmount/destroy → remount → subscribe → both `loadProject` calls resolve in original order) → assert all subscribers end up correctly wired to the second (final) load's core, with zero silently-dropped subscriptions.
- `deferredSubscribe.test.js`: revert the "preserves pending across clearCore" test added in the deviation — `clearCore()` must clear `pending`, confirmed by a test asserting a pending entry does *not* flush after a `clearCore()` → `setCore()` sequence with no re-subscribe in between.
- **Regression test for the commit-path scoping mistake:** subscribe to an element *before* `loadProject()` resolves (simulating child-before-parent mount order), then `await loadProject(validSchema)` on a normal, successful load — assert the subscriber's callback was invoked (proves the buffered subscription was flushed by `setCore()`, not silently wiped by a shared cleanup helper also clearing the registry on commit).
