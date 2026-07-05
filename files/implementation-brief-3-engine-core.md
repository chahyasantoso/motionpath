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
