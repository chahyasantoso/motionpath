# MotionPath — Implementation Brief 4: ProductionEngine (Consolidated)

**Status:** Design-complete. Core spec + Addendum B merged into one file for handoff.

**Editorial note on this merge:** the original Brief 4's scrub-trigger code paths (§3, grouped and ungrouped) spread `...triggerConfig` directly into `ScrollTrigger.create()`, without an explicit `deps.resolveElement()` call — only the observer path called it. Addendum B (§7 below) requires `trigger`/`startTrigger`/`pin`/`endTrigger` to always resolve via `data-motion-id`. To keep this merged document internally consistent, the scrub code snippets below now explicitly override `trigger`/`endTrigger`/`pin` after the spread, routed through the shared `resolveTriggerRef` helper. **This is the one substantive change from your original text — confirm it's correct (i.e. that Brief 2 does NOT already pre-resolve these fields before `ProductionEngine` sees them) or tell me to revert to the raw spread.**

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
  subscribe(
    elementId: string,
    callback: (rawState: Record<string, unknown>) => void,
  ): UnsubscribeFn;
  compose(
    elementId: string,
    rawData?: Record<string, unknown>,
  ): Record<string, unknown>;
  destroyScene(sceneId: string): void;
  destroy(): void;
  pauseTimer(id: string): void; // id = timelineId (grouped) or scenarioIndex-as-string (ungrouped)
  playTimer(id: string): void;
  enableScroll(): void;
  disableScroll(): void;
}

function createProductionEngine(deps: {
  resolveElement: (id: string) => Element;
}): ProductionEngine;

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
  ScrollTrigger.create({
    ...primaryTriggerConfig,
    trigger: resolveTriggerRef(
      primaryTriggerConfig.trigger,
      primaryScenario.sceneId,
      deps.resolveElement,
    ),
    endTrigger: resolveTriggerRef(
      primaryTriggerConfig.endTrigger,
      undefined,
      deps.resolveElement,
    ),
    pin: resolveTriggerRef(
      primaryTriggerConfig.pin,
      undefined,
      deps.resolveElement,
    ),
    animation: group.masterTimeline,
  });
  ```
  Non-primary members' own `start`/`end`/`pin` fields are never read here — Brief 1 already guarantees they're compatibility-only declarations, not real config.
- `triggerType === "time"`: apply primary's loop config to the whole group, then play:
  ```js
  group.masterTimeline
    .repeat(primaryTriggerConfig.repeat ?? 0)
    .yoyo(!!primaryTriggerConfig.yoyo)
    .repeatDelay(primaryTriggerConfig.repeatDelay ?? 0);
  group.masterTimeline.play();
  ```

**Ungrouped scenarios** (`buildResult.scenarios` without a `timelineId`), per scenario:

- `triggerType === "scroll-scrub"`:
  ```js
  ScrollTrigger.create({
    ...triggerConfig,
    trigger: resolveTriggerRef(
      triggerConfig.trigger,
      scenario.sceneId,
      deps.resolveElement,
    ),
    endTrigger: resolveTriggerRef(
      triggerConfig.endTrigger,
      undefined,
      deps.resolveElement,
    ),
    pin: resolveTriggerRef(triggerConfig.pin, undefined, deps.resolveElement),
    animation: scenario.timeline,
  });
  ```
- `triggerType === "scroll-observer"`: resolve the trigger element per the schema's cascade rule — `triggerConfig.startTrigger ?? scenario.sceneId`, passed through the shared `resolveTriggerRef` helper:
  ```js
  ScrollTrigger.create({
    trigger: resolveTriggerRef(
      triggerConfig.startTrigger,
      scenario.sceneId,
      deps.resolveElement,
    ),
    start: triggerConfig.start,
    toggleActions: triggerConfig.toggleActions,
    animation: scenario.timeline,
  });
  ```
- `triggerType === "time"`:
  ```js
  scenario.timeline
    .repeat(triggerConfig.repeat ?? 0)
    .yoyo(!!triggerConfig.yoyo)
    .repeatDelay(triggerConfig.repeatDelay ?? 0);
  scenario.timeline.play();
  ```

**Do not apply `.delay()` here.** Per Brief 2 Addendum C, `delay` is baked into the timeline at build time (it affects total duration, which `EditorEngine` also needs to see) — this module only wires triggering and playback, never timing.

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
- `destroy()` must call `ScrollTrigger.getAll().forEach(st => st.kill())` scoped to only the triggers this engine created — if multiple `ProductionEngine` instances can coexist (unlikely given the singleton export, but not structurally prevented), killing _all_ `ScrollTrigger` instances globally would affect unrelated engine instances. Track created `ScrollTrigger` references locally and kill only those.

---

## 6. Testing Requirements

- `loadProject` with an invalid schema → throws, error message contains every validation error, not just the first.
- Grouped scrub: assert exactly **one** `ScrollTrigger` is created for a two-scenario group (not two).
- Grouped time: assert `masterTimeline`'s `repeat`/`yoyo`/`repeatDelay` match the primary scenario's config, not any non-primary member's.
- Ungrouped observer: assert the resolved trigger element matches `sceneId` when no `startTrigger` override is present, and matches `startTrigger` when it is.
- `pauseTimer`/`playTimer` with an unknown id → throws.
- Partial-failure cleanup: force `ScrollTrigger.create` to throw on the second of three scenarios, assert the first scenario's timeline was killed during cleanup (proves §5's rollback, not just that the error propagated).
- **New, from the resolution-consistency fix above:** grouped/ungrouped scrub — assert `trigger`/`endTrigger`/`pin` passed to `ScrollTrigger.create()` are resolved `Element` references (via `resolveTriggerRef`/`deps.resolveElement`), not raw schema strings.

---

## 7. Addendum B — Uniform Trigger-Element Resolution

**Decision:** `trigger`, `startTrigger`, `pin`, `endTrigger` **all** resolve via `data-motion-id`, exactly like `element.id`. `start`/`end` are never resolved — they stay raw GSAP position-syntax pass-through.

### Rationale

Deliberately consistent with `element.id`'s resolution mechanism. Treating `pin`/`endTrigger` as raw CSS selectors would reintroduce exactly the selector-fragility coupling that `data-motion-id` was invented to prevent in the first place.

### `resolveTriggerRef` helper

A single shared helper used for every trigger-adjacent field — this is the function referenced throughout §3 above:

```ts
function resolveTriggerRef(
  value: string | boolean | undefined,
  fallbackSceneId: string | undefined,
  resolveElement: (id: string) => Element,
): Element | boolean | undefined {
  if (value === undefined) {
    return fallbackSceneId !== undefined
      ? resolveElement(fallbackSceneId)
      : undefined;
  }
  if (typeof value === "boolean") return value; // passthrough, e.g. pin: true
  return resolveElement(value); // string -> resolve via data-motion-id
}
```

Behavior by field:

| Field           | Input type       | Resolution                                                |
| --------------- | ---------------- | --------------------------------------------------------- |
| `trigger`       | `undefined`      | falls back to scene's own `sceneId` element               |
| `startTrigger`  | string           | resolved via `data-motion-id`                             |
| `endTrigger`    | string           | resolved via `data-motion-id`                             |
| `pin`           | boolean (`true`) | passthrough, not resolved as an element ref               |
| `pin`           | string           | resolved via `data-motion-id` (pin to a specific element) |
| `start` / `end` | string           | **never resolved** — raw GSAP position syntax             |

Use this one helper for every trigger-adjacent field — do not write field-specific resolution logic per field.

---

## 8. Verification Checklist (Addendum B specifics)

1. Grep for `resolveTriggerRef` — confirm it's used for every `trigger`, `startTrigger`, `pin`, `endTrigger` reference in §3's wiring code, across both grouped and ungrouped paths.
2. Grep for direct `triggerConfig.trigger`, `triggerConfig.pin`, `triggerConfig.endTrigger` usage **outside** a `resolveTriggerRef(...)` call — zero results (would indicate a raw string leaking through to GSAP unresolved).
3. Confirm `start`/`end` fields are never passed through `resolveTriggerRef` anywhere — they should reach GSAP as raw strings, untouched.
4. Behavioral test: schema with `pin: true` (boolean) → `ScrollTrigger.create()` receives `pin: true`, not a resolved element.
5. Behavioral test: schema with `pin: "someElementId"` (string) → `ScrollTrigger.create()` receives a resolved `Element`, not the raw string.
