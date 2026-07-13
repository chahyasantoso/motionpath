# V3 Refactor Session Summary

## Overview

This session covered three major pieces of work on the MotionPath animation engine:

1. **ProductionEngine timelineId/primary grouping support** (completed)
2. **EditorEngine refactor to lazy/instance architecture + class-based engines** (completed)
3. **Stagger transition smoothing for addChild/removeChild** (in progress — front card still snaps)

---

## 1. ProductionEngine Timeline Grouping

### What it does
Multiple motions can share a single master GSAP timeline via `timelineId`. One motion is marked `primary` and its trigger config (ScrollTrigger or autoplay) drives the entire group.

### Files created
- **`src/engines/TimelineGroupController.js`** — Factory function managing one group's master timeline lifecycle. Handles deferred driver attachment (waits for primary to mount), member add/remove, ScrollTrigger for scroll groups, autoplay for timeline groups.
- **`src/engines/__tests__/TimelineGroupController.test.js`** — 14 unit tests.

### Files modified
- **`src/engines/ProductionEngine.js`** — Added group index building in `loadProject()`, group-aware `mountInstance()` with controller creation, play/pause patching, and group-aware destroy wrapper.
- **`src/domain/instance/MotionInstance.js`** — Added `_groupMember` guard (later renamed to `_suppressDriver`) to suppress ScrollTrigger creation and autoplay for grouped instances (2 lines in `#setupDriver`).
- **`src/engines/__tests__/ProductionEngine.test.js`** — Added "Timeline Group Support" describe block with 7 integration tests.

### Design decisions
- **Deferred driver attachment**: Non-primaries can mount before the primary. Master stays paused until primary arrives.
- **Keyed by instanceId**: Members map uses `instance.id` (not motionId) to handle same motion mounted twice.
- **Config flag approach**: `_suppressDriver` tells MotionInstance to skip its own driver setup, matching the existing `parentId` pattern.

---

## 2. EditorEngine Refactor + Class-Based Engines

### What it does
Unified both engines on the MotionInstance architecture and converted from factory functions to classes with inheritance.

### Files created
- **`src/engines/BaseEngine.js`** — Shared class with loadProject (validate, preload plugins, parse, build group index), mountInstance (with subclass hooks), destroy, resolveMotion, trigger ref registry.
- **`src/engines/__tests__/BaseEngine.test.js`** — *(not created — shared behavior tested through subclass tests)*

### Files rewritten
- **`src/engines/ProductionEngine.js`** — Now a thin class extending BaseEngine. Only overrides `_configForMount` (suppress driver for grouped members) and `_onInstanceMounted` (patch play/pause for groups). Exports both the class and `createProductionEngine()` factory for backward compat.
- **`src/engines/EditorEngine.js`** — Class extending BaseEngine. Eagerly mounts all non-delegate motions at `loadProject` time. ALL instances get `_suppressDriver: true`. Adds `setProgress`, `subscribe(trackId)`, `compose(trackId)`, `destroySection`. Uses `deferredCall` for pre-load subscriptions.
- **`src/engines/__tests__/EditorEngine.test.js`** — Complete rewrite (21 tests) testing the new class API with real schemas instead of mocked buildProject.

### Files modified
- **`src/domain/instance/MotionInstance.js`** — Renamed `_groupMember` → `_suppressDriver` (2 lines).
- **`src/domain/plugins.js`** — Added `ensureLoaded()` and `_resetLoadPromises()` (relocated from BuildProject.js).
- **`src/engines/resolveMotion.js`** — Redirected import: `buildTrackTween as buildTrackTweenSync` from `BuildTrackTween.js` directly.
- **`src/domain/models.js`** — Added `staggerTransition` field to `createMotionDefinition`.
- **`src/usecases/ParseProjectSchema.js`** — Pass through `staggerTransition` from schema.

### Files deleted
- `src/usecases/BuildProject.js` — `ensureLoaded` moved to plugins.js; `buildTrackTweenSync` was a passthrough; `buildProject()` was only used by old EditorEngine path.
- `src/usecases/CompileProject.js` — Only used by old EditorEngine.
- `src/engines/editorEngineCore.js` — Only used by CompileProject.
- `src/usecases/__tests__/BuildProject.test.js`
- `src/usecases/__tests__/CompileProject.test.js`
- `src/engines/__tests__/editorEngineCore.test.js`

### BaseEngine class design
```
BaseEngine
├── _instances (Map: instanceId → instance)
├── _groups (Map: timelineId → TimelineGroupController)
├── _groupIndex (Map: timelineId → { memberIds, primaryId })
├── _project, _core, _schema, _triggerRefs
├── #loadGeneration, #motionResolver, #deferredCall, #resolveElement
│
├── loadProject(schema) — validate, preload plugins, parse, build group index
├── mountInstance(motionId, config) — create instance, wire groups, wrap destroy
├── resolveMotion(motionId, progress, overrides)
├── destroy()
├── registerTriggerRef / unregisterTriggerRef
│
└── Subclass hooks:
    ├── _configForMount(motionId, config, groupSpec) — modify config before instance creation
    ├── _onProjectLoaded() — called at end of loadProject
    └── _onInstanceMounted(instance, groupSpec) — called after instance registered
```

### ProductionEngine (extends BaseEngine)
- `_configForMount`: adds `_suppressDriver: true` only for grouped members
- `_onInstanceMounted`: patches `play()`/`pause()` to forward to group controller

### EditorEngine (extends BaseEngine)
- `_configForMount`: adds `_suppressDriver: true` for ALL instances
- `loadProject`: calls `super.loadProject()` then eagerly mounts all non-delegate motions, builds track index, flushes deferred subscriptions
- `setProgress(target, progress)`: seeks group controller or individual instance
- `subscribe(trackId, callback)`: deferred before load, direct after
- `compose(trackId, rawData)`: delegates to instance
- `destroySection(sectionId)`: destroys instances matching section

---

## 3. Stagger Transition Smoothing (In Progress)

### Problem
When adding/removing a child from a scroll-scrubbed parent timeline:
1. `timeline.add()` or `timeline.remove()` changes the parent's total duration
2. ScrollTrigger immediately maps the same scroll position to the new duration
3. All children jump to new positions before any animation starts
4. The front cards (lower indices) jump even though their stagger index didn't change

### Changes made
- **`src/domain/instance/MotionInstance.js`** — Rewrote `addChild` and `removeChild` to:
  1. Snapshot `progress` and `totalDuration` before mutation
  2. After mutation, call `#compensateChildren()` which computes a compensated `startTime` for each child that preserves its visual position
  3. Immediately sets compensated startTime (no visual jump)
  4. Animates from compensated → target stagger position
- **Schema-driven config**: `staggerTransition: { duration, ease }` on the motion schema replaces hardcoded `0.6` / `power2.out`
- **`src/domain/models.js`** — Added `staggerTransition` field
- **`src/usecases/ParseProjectSchema.js`** — Passes through `staggerTransition`

### Current issue
The compensation math in `#compensateChildren()` isn't fully preventing the front card snap. The `compensatedStart` calculation simplifies to `currentStart` (since `prevTime - currentStart` is the visual time, and `prevTime - visualTime = currentStart`). The real problem is that after the duration change, the parent's progress is re-evaluated by ScrollTrigger at the *new* duration before our compensation runs. Needs further investigation.

---

## Test Results

All **257 tests pass** across **37 test files** after the refactor (down from 265 before — the deleted files had 8 tests).

## Schema Usage Example

```js
const carouselScene = {
  motionId: 'carousel-storytelling',
  driver: {
    type: 'timeline',
    sectionId: 'carousel-storytelling',
    trigger: { type: 'scroll', scrub: 1.2, pin: 'carousel-stage', start: 'top top', end: 'bottom bottom' }
  },
  stagger: 0.14,
  staggerTransition: { duration: 0.4, ease: 'power3.out' },
  tracks: [{ id: 'card-track', keyframes: { /* ... */ } }]
};
```

## Architecture After Refactor

```
BaseEngine (shared: loadProject, mountInstance, destroy, resolveMotion, groups, trigger refs)
├── ProductionEngine (lazy mount on demand, driver suppression for groups only)
└── EditorEngine (eager mount at load, all drivers suppressed, setProgress/subscribe/compose)

MotionInstance (timeline, tracks, subscribers, children, stagger compensation)
TimelineGroupController (master timeline, deferred driver, member lifecycle)
```
