# MotionPath — Implementation Brief 5: EditorEngine

**Status:** Design-complete. Standalone spec.

**Precondition:** composes `EngineCore` (Brief 3) for `subscribe`/`compose`/`destroyScene`/`destroy`. Consumes `buildProject` (Brief 2) directly. Never touches `ScrollTrigger`.

---

## 1. Purpose

Isolated-canvas scrubbing driver for editor/preview tooling. No real scroll or timer playback — every position on the timeline is reached by calling `.progress()` directly. Per architecture doc §10: 0% progress always means "elements at natural rest state," regardless of whether real scroll/time would have reached that point — scrubbing bypasses the trigger by design, it does not simulate it.

---

## 2. Public Interface

```ts
interface EditorEngine {
  loadProject(schema: unknown): Promise<void>;
  subscribe(elementId: string, callback: (rawState: Record<string, unknown>) => void): UnsubscribeFn;
  compose(elementId: string, rawData?: Record<string, unknown>): Record<string, unknown>;
  destroyScene(sceneId: string): void;
  destroy(): void;
  setProgress(target: string, progress: number): void;
}

function createEditorEngine(deps: { resolveElement: (id: string) => Element }): EditorEngine
```

**`target` addressing — deliberately unambiguous, reusing `BuildResult`'s own keys rather than inventing a new addressing scheme:**
- If the scenario is grouped: `target` is the `timelineId` string.
- If ungrouped: `target` is the scenario's `scenarioIndex`, passed as a string (e.g. `"2"`).

`sceneId` is explicitly **not** a valid `target` value — it isn't guaranteed unique across scenarios (multiple scenarios can share a `sceneId` per the schema), so using it as an addressing key would be ambiguous by design, not just inconvenient.

---

## 3. `loadProject(schema)` — Behavior

Identical to `ProductionEngine`'s steps 1–3 (validate via Brief 1, build via Brief 2, construct `EngineCore` via Brief 3) — **stop there.** Do not perform step 4 (trigger wiring) at all. No `ScrollTrigger.create()` calls anywhere in this module, no `.play()` calls anywhere in this module.

## 4. `setProgress(target, progress)` — Behavior

```js
const clamped = Math.max(0, Math.min(1, progress));
const group = buildResult.timelineGroups.get(target);
if (group) {
  group.masterTimeline.progress(clamped);
  return;
}
const scenario = buildResult.scenarios.find(s => String(s.scenarioIndex) === target);
if (scenario) {
  scenario.timeline.progress(clamped);
  return;
}
throw new Error(`setProgress: no group or scenario found for target "${target}".`);
```

- Group lookup first, scenario fallback second — matches architecture §10's resolution order exactly. Observer scenarios always fall into the ungrouped branch (Brief 1 guarantees they can never carry a `timelineId`).
- `delay` (Brief 2 Addendum C) is already baked into the timeline's total duration at build time — `.progress()` naturally accounts for it as dead space at the front of the range. No special-case handling needed here; this is precisely why `delay` belongs in the builder rather than either engine.

---

## 5. Non-Goals

- No `ScrollTrigger` creation, ever, under any code path.
- No `.play()`/`.pause()`/timer controls — those are `ProductionEngine`-only surface. `EditorEngine` never auto-advances anything; every position change is an explicit `setProgress` call.
- No live-page/real-scroll simulation, no "preview where this would fire on the real page" mode. Explicitly deferred per architecture §10 — isolated canvas only, matching After Effects/Figma/Rive precedent already cited there.
- No `subscribe`/`compose`/`destroyScene`/`destroy` reimplementation — delegate to `EngineCore` (Brief 3), identical to `ProductionEngine`'s delegation.

---

## 6. Testing Requirements

- `setProgress` on a grouped `target` → asserts `masterTimeline.progress()` was called with the clamped value, not any individual child scenario's timeline directly.
- `setProgress` on an ungrouped `target` (scenario index) → asserts the correct scenario's own `timeline.progress()` was called.
- `setProgress` with an out-of-range `progress` (e.g. `1.5` or `-0.2`) → clamped to `[0,1]` before being applied, does not throw.
- `setProgress` with an unknown `target` → throws.
- `setProgress` with a `sceneId` passed by mistake (not a valid `timelineId` or `scenarioIndex`) → throws (proves `sceneId` is correctly rejected as ambiguous, not silently matched against something).
- Regression test proving isolation: after `loadProject`, assert `ScrollTrigger.getAll().length` is unchanged from before load (proves no trigger was ever created by this module).
