# MotionPath — Brief 3: ProductionEngine

**Audience:** AI coding agent (Gemini Flash) implementing directly against `lib/builder.js`'s `BuildResult`.
**Precondition:** Read `brief3-shared-utilities.md` FIRST and implement `lib/timelineResolver.js` and `lib/compose.js` before starting this brief. This brief imports both — it does not redefine them.
**Scope:** the ONLY engine in this project that touches real playback (ScrollTrigger, `.play()`, timer/scroll enable-disable). Do not add any of this to EditorEngine (Brief 4) — see that brief's own non-goals.

---

## §0 — Warning: known failure modes for fast/cheap models

1. **Do not attach a ScrollTrigger per element.** The timeline already aggregates every element in a scenario/group (that's what Brief 2's builder produced). One ScrollTrigger per scenario-or-group, never per element. If your code loops over `elements` and calls `ScrollTrigger.create()` inside that loop, that is a bug — the loop should be over scenarios/groups, not elements.

2. **Do not read `triggerConfig` from a non-primary scenario in a group.** Per schema, only the primary scenario's `triggerConfig` carries real `start`/`end`/`pin`/`endTrigger`/`toggleActions`/`repeat`/`yoyo`/`repeatDelay` values for a group. Non-primary members only declare type/scrub compatibility — reading their config for real trigger values will silently produce wrong scroll behavior that looks correct in a quick manual test but breaks under different scroll configurations.

3. **Do not write two separate code paths for "primary governs group" (one for scrub, one for time).** These are the same rule applied to two trigger types. Write it once: "when grouped, always read `buildResult.timelineGroups.get(id).primaryScenarioIndex` to find the scenario whose `triggerConfig` is authoritative for the whole group — regardless of whether the group's `triggerType` is scroll-scrub or time." Two near-identical branches here is a sign you've duplicated instead of unified.

4. **Do not call `resolveTimeline()` yourself in a way that bypasses the shared helper.** Import it from `lib/timelineResolver.js`. Do not write your own inline group-then-scenario-fallback logic in this file.

5. **Do not implement compose()/subscribe() in this file.** They are imported from `lib/compose.js` (see shared utilities brief). If you find yourself writing filter-consolidation logic inside ProductionEngine.js, stop — it belongs in the shared file, already implemented.

6. **`enableScroll`/`disableScroll` operate on ScrollTrigger instances, not GSAP timelines.** Use `ScrollTrigger.getById(target)` — the ScrollTrigger must have been created with `{ id: target }` matching the `sceneId`/`timelineId` used elsewhere, or `getById` will return `undefined` and your enable/disable calls will silently no-op. Verify the id is set at creation time in step 1 below before writing step 3.

7. **Do not call `.play()` inside the ScrollTrigger creation branch, or vice versa.** Scroll-triggered and time-triggered scenarios/groups are mutually exclusive per schema (`trigger.type` is one of `scroll`/`time`, never both). Branch cleanly on `triggerType`; do not let one code path run for both.

If uncertain, prefer NOT writing code and instead re-reading the relevant section below — a missing feature is easier to fix in review than a silently wrong one.

---

## Responsibilities

### 1. Scroll scenario/group attachment

For every entry in `buildResult.scenarios` and `buildResult.timelineGroups` whose `triggerType` is `'scroll-scrub'` or `'scroll-observer'`:

- **If part of a `timelineId` group:** look up `buildResult.timelineGroups.get(timelineId)`, then find the primary scenario via `primaryScenarioIndex` (index into `buildResult.scenarios`). Read `triggerConfig` from THAT scenario. Create exactly one `ScrollTrigger` for the whole group, targeting `group.masterTimeline`, with `id: timelineId`.
- **If ungrouped:** read the scenario's own `triggerConfig` directly. Create one `ScrollTrigger` targeting the scenario's own `timeline`, with `id: sceneId`.
- Map `triggerConfig` fields directly to `ScrollTrigger.create()` options: `start`, `end`, `pin`, `endTrigger`, `toggleActions`, `scrub` (already resolved into `triggerType`, but ScrollTrigger still needs the boolean/number `scrub` value — read it from `triggerConfig.scrub`).

### 2. Time-triggered autoplay

For every entry whose `triggerType` is `'time'` (not scroll):

- Resolve the timeline via `resolveTimeline(sceneId_or_timelineId, buildResult)` (imported from shared utilities).
- If grouped, apply `repeat`/`yoyo`/`repeatDelay` from the PRIMARY scenario's `triggerConfig` to the resolved `masterTimeline` — same primary-governs-group rule as scroll (§0 point 3), not a separate implementation.
- Call `.play()` on the resolved timeline.

### 3. Playback control surface (architecture §9)

```js
export function pauseTimer(target, buildResult) {
  resolveTimeline(target, buildResult).pause();
}

export function playTimer(target, buildResult) {
  resolveTimeline(target, buildResult).play();
}

export function enableScroll(target) {
  ScrollTrigger.getById(target)?.enable();
}

export function disableScroll(target) {
  ScrollTrigger.getById(target)?.disable();
}
```

`target` is always a `sceneId` or `timelineId` string — the same id used when the ScrollTrigger/timeline was created in steps 1–2.

### 4. Live render loop

For every element (iterate `buildResult.elements.keys()`), call `subscribe(elementId, buildResult, callback)` (imported from shared utilities) where `callback` calls `compose(elementId, buildResult)` on every tick. This is the ONLY place in the whole codebase where subscribe+compose are wired together into a continuous loop — EditorEngine calls `compose()` on-demand, never continuously.

---

## Explicitly not doing here

- No `setProgress`/`seek` API — that is EditorEngine's (Brief 4) responsibility entirely.
- No re-implementation of filter consolidation or path resolution — both live in the shared `compose()`.
- No `MotionEngine` base class shared with EditorEngine — see shared utilities brief, "Why no unified interface."

**File:** `lib/ProductionEngine.js`

**Tests:** `lib/__tests__/ProductionEngine.test.js`
- Mock `ScrollTrigger.create` and `ScrollTrigger.getById`.
- Grouped scrub scenario: assert `ScrollTrigger.create` was called with config values matching the PRIMARY scenario's `triggerConfig`, not the non-primary member's.
- Grouped time scenario: assert `.play()` was called on `masterTimeline` and that `repeat`/`yoyo` came from the primary's `triggerConfig`.
- Ungrouped scroll scenario: assert `ScrollTrigger.create` used that scenario's own `triggerConfig`.
- Ungrouped time scenario: assert `.play()` called directly on the scenario's `timeline`.
- `pauseTimer('some-id', buildResult)` calls `.pause()` on whatever `resolveTimeline` returns for that id (mock `resolveTimeline` or use a real minimal `buildResult` fixture — either is acceptable, but assert the resolved object's method was called, not just that no error was thrown).
- `enableScroll`/`disableScroll` call `.enable()`/`.disable()` on the ScrollTrigger instance returned by `getById`, and do NOT throw when `getById` returns `undefined` (assert graceful no-op, e.g. `expect(() => enableScroll('missing-id')).not.toThrow()`).
