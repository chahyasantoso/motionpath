# MotionPath — Implementation Brief 4: ProductionEngine

**Status:** Design-complete. Standalone spec.

**Precondition:** composes `EngineCore` (Brief 3) for `subscribe`/`compose`/`destroyScene`/`destroy` — does not reimplement any of them. Consumes `buildProject` (Brief 2) directly.

**Migration context, read before implementing:** this replaces `motionEngine.js`'s `GsapPubSub`. A React hook (`useMotionSubscriber`) currently imports a default-exported singleton from `motionEngine.js` and calls `subscribe`/`compose`/`loadProject`/`destroyScene`/`destroy` on it. This module must export a singleton in the same shape, so the hook's import line is the only thing that changes — not its call sites. `motionEngine.js` and `validateScenario.js` are deleted only after the hook is repointed here and existing tests pass against the new singleton.

---

## 1. Purpose

The real, live-playing driver: attaches actual `ScrollTrigger` instances for scroll scenarios/groups, calls `.play()` for time scenarios/groups, exposes basic playback controls.

---

## 2. Public Interface

```ts
interface ProductionEngine {
  loadProject(schema: unknown): Promise<void>;
  subscribe(elementId: string, callback: (rawState: Record<string, unknown>) => void): UnsubscribeFn;
  compose(elementId: string, rawData?: Record<string, unknown>): Record<string, unknown>;
  destroyScene(sceneId: string): void;
  destroy(): void;
  pauseTimer(id: string): void;   // id = timelineId (grouped) or scenarioIndex-as-string (ungrouped)
  playTimer(id: string): void;
  enableScroll(): void;
  disableScroll(): void;
}

function createProductionEngine(deps: { resolveElement: (id: string) => Element }): ProductionEngine

// Singleton export, mirroring motionEngine.js's current shape for a drop-in hook swap:
export const productionEngine: ProductionEngine;
```

---

## 3. `loadProject(schema)` — Behavior

1. `const errors = validateProject(schema)` (Brief 1). If any entry has `severity === "error"`, throw one `Error` whose message lists every error (not just the first — collect-all was the whole point of Brief 1; don't discard that here by throwing on the first one found). Log warnings (`console.warn`) but do not block on them.
2. `const buildResult = await buildProject(schema, deps)` (Brief 2).
3. Construct `this._core = createEngineCore(buildResult)` (Brief 3). Store `buildResult` for the wiring step below and for `pauseTimer`/`playTimer` lookups.
4. **Wire real triggers** — this is the only genuinely new logic in this module:

**Grouped scenarios** (`buildResult.timelineGroups`), per group:
- Find the primary scenario's raw `triggerConfig` (via `primaryScenarioIndex`, looked up in `schema.scenarios`).
- `triggerType === "scroll-scrub"`: create exactly **one** `ScrollTrigger` for the whole group, targeting `masterTimeline`:
  ```js
  ScrollTrigger.create({ ...primaryTriggerConfig, animation: group.masterTimeline });
  ```
  Non-primary members' own `start`/`end`/`pin` fields are never read here — Brief 1 already guarantees they're compatibility-only declarations, not real config.
- `triggerType === "time"`: apply primary's loop config to the whole group, then play:
  ```js
  group.masterTimeline.repeat(primaryTriggerConfig.repeat ?? 0)
                       .yoyo(!!primaryTriggerConfig.yoyo)
                       .repeatDelay(primaryTriggerConfig.repeatDelay ?? 0);
  group.masterTimeline.play();
  ```

**Ungrouped scenarios** (`buildResult.scenarios` without a `timelineId`), per scenario:
- `triggerType === "scroll-scrub"`:
  ```js
  ScrollTrigger.create({ ...triggerConfig, animation: scenario.timeline });
  ```
- `triggerType === "scroll-observer"`: resolve the trigger element per the schema's cascade rule — `triggerConfig.startTrigger ?? scenario.sceneId`, passed through `deps.resolveElement`:
  ```js
  ScrollTrigger.create({
    trigger: deps.resolveElement(triggerConfig.startTrigger ?? scenario.sceneId),
    start: triggerConfig.start,
    toggleActions: triggerConfig.toggleActions,
    animation: scenario.timeline,
  });
  ```
- `triggerType === "time"`:
  ```js
  scenario.timeline.repeat(triggerConfig.repeat ?? 0)
                    .yoyo(!!triggerConfig.yoyo)
                    .repeatDelay(triggerConfig.repeatDelay ?? 0);
  scenario.timeline.play();
  ```

**Do not apply `.delay()` here.** Per Brief 2 Addendum C, `delay` is baked into the timeline at build time (it affects total duration, which `EditorEngine` also needs to see) — this module only wires triggering and playback, never timing.

### `pauseTimer(id)` / `playTimer(id)`

Minimal pass-through, no state machine: look up `buildResult.timelineGroups.get(id)?.masterTimeline` first, fall back to `buildResult.scenarios.find(s => String(s.scenarioIndex) === id)?.timeline`. Call `.pause()` / `.play()` on whichever is found. Throw if neither resolves — a caller passing an unknown id is a bug worth surfacing, not silently ignoring.

### `enableScroll()` / `disableScroll()`

Global pass-through only — `ScrollTrigger.getAll().forEach(st => st.enable())` / `.disable()`. **Do not build per-scenario selective enable/disable** — nothing in the current schema or any use case discussed calls for it; global is the documented behavior and the cheap, correct default until a real case needs finer granularity.

---

## 4. Non-Goals

- No `subscribe`/`compose`/`destroyScene`/`destroy` reimplementation — delegate to `this._core` (Brief 3) directly, one line each.
- No plugin resolution, no merge logic — already done by `buildProject`.
- No re-validation of `timelineId` grouping rules — trust Brief 1.
- No `.delay()` handling — Brief 2's responsibility.
- No compatibility shim, no feature-flagged dual-mode operation between old and new engines. The migration is a straight singleton swap (see Migration context above), not a parallel-running bridge — building a bridge here would be more code than the actual cutover requires.

---

## 5. Security & Robustness

- `loadProject` must not leave a half-wired project if trigger-wiring throws partway through — if `ScrollTrigger.create()` fails for scenario 3 of 5, kill everything built so far (`buildResult` timelines) before re-throwing, so a failed load doesn't leave orphaned `ScrollTrigger` instances attached to a DOM that no longer has a valid engine behind it.
- `destroy()` must call `ScrollTrigger.getAll().forEach(st => st.kill())` scoped to only the triggers this engine created — if multiple `ProductionEngine` instances can coexist (unlikely given the singleton export, but not structurally prevented), killing *all* `ScrollTrigger` instances globally would affect unrelated engine instances. Track created `ScrollTrigger` references locally and kill only those.

---

## 6. Testing Requirements

- `loadProject` with an invalid schema → throws, error message contains every validation error, not just the first.
- Grouped scrub: assert exactly **one** `ScrollTrigger` is created for a two-scenario group (not two).
- Grouped time: assert `masterTimeline`'s `repeat`/`yoyo`/`repeatDelay` match the primary scenario's config, not any non-primary member's.
- Ungrouped observer: assert the resolved trigger element matches `sceneId` when no `startTrigger` override is present, and matches `startTrigger` when it is.
- `pauseTimer`/`playTimer` with an unknown id → throws.
- Partial-failure cleanup: force `ScrollTrigger.create` to throw on the second of three scenarios, assert the first scenario's timeline was killed during cleanup (proves §5's rollback, not just that the error propagated).
