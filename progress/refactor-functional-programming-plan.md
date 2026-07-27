# MotionPath Functional Programming Refactor Plan

**Status:** Draft for Review  
**Created:** 2026-07-13  
**Branch:** `refactor/functional-architecture` (to be created)

---

## Executive Summary

This plan outlines a complete refactor of MotionPath from mixed OOP/FP paradigms to consistent functional architecture. The goal is to improve maintainability, reduce cognitive load, and align implementation with the declarative, schema-driven design philosophy.

**Key Metrics:**

- **Current state:** ~40% OOP (domain models, instances), ~60% FP (engines, validators, usecases)
- **Target state:** ~95% FP (only data structures remain, all behavior is functional)
- **Estimated operations:** 35-55 file operations across 4 phases
- **Estimated test files affected:** 15-20
- **External API compatibility:** Maintained (hooks and engine methods unchanged)

---

## Current Architecture Analysis

### What's Already Functional ✅

- **Engines:** `createProductionEngine()`, `createEditorEngine()` - factory functions with closure state
- **Validators:** Pure functions, no side effects, collect-all error reporting
- **Usecases:** Pure functions - `resolveTrack()`, `composeTrackPatch()`, etc.
- **Plugins:** Mostly functional with factory pattern

### What's Object-Oriented ⚠️

- **Domain Models:** ES6 classes - `MotionProject`, `MotionDefinition`, `MotionTrack`, `TimelineDriver`, etc.
- **MotionInstance Hierarchy:** Class inheritance - `MotionInstance` → `TimelineMotionInstance`, `ScrollMotionInstance`, `ManualMotionInstance`
- **Mixed Patterns:** Engine factories manage state in closures but instantiate class-based instances

### Problems with Current Approach

1. **Paradigm Confusion:** Two mental models (FP in validators/usecases, OOP in domain/instances)
2. **Forced Inheritance:** Instance hierarchy uses inheritance for behavior that could be composed
3. **State Management Inconsistency:** Closures in engines, class properties in instances
4. **Complex Lifecycle:** Instance methods (`subscribe`, `addChild`, `seek`, `destroy`) tightly coupled to class structure

---

## Guiding Principles

1. **Pure Functions First:** Behavior should be in pure functions that take data and return data
2. **Composition Over Inheritance:** Build complex behavior from simple, composable functions
3. **Immutability Where Possible:** Data structures should be created and returned, not mutated
4. **Explicit State:** State should be in closures (for private state) or plain objects (for shared state)
5. **Consistent Patterns:** All modules should follow the same structural patterns

---

## Phase 1: Domain Models (Foundation)

**Risk:** Low  
**Impact:** High  
**Estimated Operations:** 8-12  
**Files Affected:** 3-4

### Goal

Convert domain model classes to factory functions that return plain objects with data (no methods).

### Files to Refactor

#### 1. `src/domain/models.js` (~140 lines)

**Current Structure:**

```javascript
export class MotionProject {
  constructor({ schemaVersion, perspective, templates, motions }) {
    this.schemaVersion = schemaVersion;
    this.perspective = perspective;
    this.templates = new Map(templates.map(t => [t.templateId, t]));
    this.motions = new Map(motions.map(m => [m.motionId, m]));
  }

  getMotion(motionId) { return this.motions.get(motionId); }
  getTemplate(templateId) { return this.templates.get(templateId); }
  getMotionsList() { return Array.from(this.motions.values()); }
}

export class MotionDefinition { ... }
export class MotionTrack { ... }
// etc.
```

**Target Structure:**

```javascript
// Factory functions return plain data objects
export function createMotionProject({
  schemaVersion,
  perspective = null,
  templates = [],
  motions = [],
}) {
  return {
    schemaVersion,
    perspective,
    templates: new Map(templates.map((t) => [t.templateId, t])),
    motions: new Map(motions.map((m) => [m.motionId, m])),
  };
}

// Helper functions operate on data
export function getMotion(project, motionId) {
  return project.motions.get(motionId);
}

export function getTemplate(project, templateId) {
  return project.templates.get(templateId);
}

export function getMotionsList(project) {
  return Array.from(project.motions.values());
}

export function createMotionDefinition({
  motionId,
  driver,
  stagger = null,
  tracks = [],
}) {
  return { motionId, driver, stagger, tracks };
}

// Behavior as pure functions
export function isTimelineMotion(motion) {
  return motion.driver.type === "timeline";
}

export function isScrollMotion(motion) {
  return (
    motion.driver.type === "timeline" &&
    motion.driver.trigger?.type === "scroll"
  );
}

export function isDelegateMotion(motion) {
  return motion.driver.type === "delegate";
}
```

#### 2. `src/usecases/ParseProjectSchema.js` (~70 lines)

Update to use factory functions instead of `new MotionProject(...)`.

**Changes:**

```javascript
// BEFORE
return new MotionProject({
  schemaVersion: schema.schemaVersion,
  perspective: schema.perspective,
  templates,
  motions,
});

// AFTER
return createMotionProject({
  schemaVersion: schema.schemaVersion,
  perspective: schema.perspective,
  templates,
  motions,
});
```

#### 3. Update Consumers

Files that use `project.getMotion()` should be updated to use `getMotion(project, id)`:

- `src/engines/ProductionEngine.js` - 3-4 call sites
- `src/engines/EditorEngine.js` - 2-3 call sites
- `src/engines/resolveMotion.js` - 1-2 call sites

#### 4. Tests

Update `src/domain/__tests__/domain.test.js` to use new factories.

### Success Criteria

- ✅ All domain model classes removed
- ✅ All consumers updated to use helper functions
- ✅ All tests pass
- ✅ No behavior changes, only structural refactor

---

## Phase 2: MotionInstance Hierarchy (Core Refactor)

**Risk:** High  
**Impact:** High  
**Estimated Operations:** 15-25  
**Files Affected:** 8-12

### Goal

Replace class-based instance hierarchy with factory functions and composed behavior.

### Challenge

`src/domain/MotionInstance.js` is ~400 lines - **must be chunked and split**.

### Strategy: Split First, Then Refactor

#### Step 2.1: Split MotionInstance.js Into Modules

Create new directory: `src/domain/instance/`

**New files:**

1. `src/domain/instance/base.js` - Core instance state and lifecycle
2. `src/domain/instance/subscribers.js` - Subscription management
3. `src/domain/instance/timeline.js` - Timeline-specific behavior
4. `src/domain/instance/scroll.js` - Scroll-specific behavior
5. `src/domain/instance/manual.js` - Manual-specific behavior
6. `src/domain/instance/composition.js` - Parent-child, stagger logic
7. `src/domain/instance/index.js` - Main factory that composes everything

#### Step 2.2: Implement Functional Instance Factory

**`src/domain/instance/index.js` (main factory):**

```javascript
import { createBaseInstance } from "./base.js";
import { createTimelineBehavior } from "./timeline.js";
import { createScrollBehavior } from "./scroll.js";
import { createManualBehavior } from "./manual.js";
import { createSubscriberManager } from "./subscribers.js";
import { createCompositionBehavior } from "./composition.js";

export function createMotionInstance(
  motionId,
  config,
  schemaMotion,
  templates,
  deps,
  onSubscriberChange,
) {
  // Create base instance data
  const base = createBaseInstance(motionId, config, schemaMotion, templates);

  // Create subscriber manager
  const subscribers = createSubscriberManager(onSubscriberChange);

  // Create driver-specific behavior
  const driverType = schemaMotion.driver.type;
  const driverBehavior =
    driverType === "timeline"
      ? createTimelineBehavior(base, schemaMotion, deps)
      : driverType === "scroll"
        ? createScrollBehavior(base, schemaMotion, deps)
        : createManualBehavior(base, schemaMotion, deps);

  // Create composition behavior (parent-child, stagger)
  const composition = createCompositionBehavior(base, schemaMotion, deps);

  // Compose final instance object
  return {
    // Public properties
    id: base.id,
    motionId: base.motionId,
    config: base.config,
    tracks: base.tracks,
    tracksMap: base.tracksMap,
    children: composition.children,

    // Driver-specific properties
    ...driverBehavior.properties,

    // Public methods (all composed from behavior modules)
    subscribe: subscribers.subscribe,
    unsubscribe: subscribers.unsubscribe,
    addChild: composition.addChild,
    seek: driverBehavior.seek,
    play: driverBehavior.play,
    pause: driverBehavior.pause,
    destroy: () => {
      driverBehavior.destroy();
      subscribers.destroy();
      composition.destroy();
    },
  };
}
```

**`src/domain/instance/base.js`:**

```javascript
export function createBaseInstance(motionId, config, schemaMotion, templates) {
  const id = generateInstanceId();
  const tracks = buildTracks(schemaMotion.tracks, templates);
  const tracksMap = new Map(tracks.map((t) => [t.id, t]));

  return {
    id,
    motionId,
    config: { ...config },
    tracks,
    tracksMap,
    schemaMotion,
  };
}

function generateInstanceId() {
  return `inst_${Math.random().toString(36).slice(2, 11)}`;
}

function buildTracks(schemaTracks, templates) {
  // Build track data (extracted from current ._build() method)
  // ...
}
```

**`src/domain/instance/subscribers.js`:**

```javascript
export function createSubscriberManager(onSubscriberChange) {
  const subscriptions = new Map(); // trackId -> Set<callback>

  function subscribe(trackId, callback) {
    if (!subscriptions.has(trackId)) {
      subscriptions.set(trackId, new Set());
    }
    subscriptions.get(trackId).add(callback);

    const hasAny = Array.from(subscriptions.values()).some((s) => s.size > 0);
    onSubscriberChange?.(hasAny);

    return () => unsubscribe(trackId, callback);
  }

  function unsubscribe(trackId, callback) {
    const cbs = subscriptions.get(trackId);
    if (cbs) {
      cbs.delete(callback);
      if (cbs.size === 0) subscriptions.delete(trackId);
    }

    const hasAny = Array.from(subscriptions.values()).some((s) => s.size > 0);
    onSubscriberChange?.(hasAny);
  }

  function notify(trackId, patch) {
    const cbs = subscriptions.get(trackId);
    if (cbs) {
      cbs.forEach((cb) => cb(patch));
    }
  }

  function destroy() {
    subscriptions.clear();
    onSubscriberChange?.(false);
  }

  return { subscribe, unsubscribe, notify, destroy };
}
```

**`src/domain/instance/timeline.js`:**

```javascript
export function createTimelineBehavior(base, schemaMotion, deps) {
  const timeline = buildTimelineForInstance(base, schemaMotion, deps);

  return {
    properties: {
      timeline,
      type: "timeline",
    },

    seek(progress) {
      timeline.progress(progress);
    },

    play() {
      timeline.play();
    },

    pause() {
      timeline.pause();
    },

    destroy() {
      timeline.kill();
    },
  };
}
```

Similar patterns for `scroll.js`, `manual.js`, and `composition.js`.

#### Step 2.3: Update MountMotionInstance

`src/usecases/MountMotionInstance.js` stays mostly the same, just uses the new factory:

```javascript
import { createMotionInstance } from "../domain/instance/index.js";

export function mountMotionInstance(...args) {
  return createMotionInstance(...args);
}
```

#### Step 2.4: Update Engine Integration

`ProductionEngine.js` and `EditorEngine.js` already use `mountMotionInstance()`, so minimal changes needed.

### Success Criteria

- ✅ All class-based instances removed
- ✅ Behavior composed from modules, not inherited
- ✅ Instance API unchanged (external compatibility)
- ✅ All engine tests pass
- ✅ All hook tests pass

---

## Phase 3: Hook Layer Verification

**Risk:** Low  
**Impact:** Medium  
**Estimated Operations:** 4-6  
**Files Affected:** 4-5

### Goal

Verify React hooks work correctly with refactored domain models and instances.

### Files to Verify/Update

1. `src/hooks/useMotionProject.js` - Uses engine, should work as-is
2. `src/hooks/useMotionInstance.js` - Uses engine.mountInstance(), should work as-is
3. `src/hooks/useMotionSubscriber.js` - Uses instance.subscribe(), should work as-is
4. `src/hooks/useMotionTrigger.js` - Uses engine.registerTriggerRef(), should work as-is

### Updates Needed

- Import paths if domain models moved
- Helper function calls instead of methods (e.g., `getMotion(project, id)` instead of `project.getMotion(id)`)

### Success Criteria

- ✅ All hook tests pass
- ✅ No behavioral changes
- ✅ External hook API unchanged

---

## Phase 4: Demo Pages & Integration Verification

**Risk:** Low  
**Impact:** Low  
**Estimated Operations:** 5-10  
**Files Affected:** 5-8

### Goal

Verify all demo pages and integration code work with refactored architecture.

### Files to Verify

1. `src/components/TowerDefense/TowerDefensePage.jsx` - Uses useMotionProject, useMotionInstance
2. `src/components/PasarMalam/PasarMalamPage.jsx` - Uses useMotionProject, scroll triggers
3. `src/components/Motorcycle/MotorcyclePage.jsx` - Complex parallax
4. `src/components/Burst/BurstPage.jsx` - Particle effects
5. `src/components/Demo/DemoPage.jsx` - Multiple demo scenarios

### Verification Process

1. Run each demo page locally
2. Verify animations work correctly
3. Check console for errors
4. Verify hot reload works

### Success Criteria

- ✅ All demo pages render without errors
- ✅ All animations work as before
- ✅ No console warnings/errors
- ✅ Hot reload works

---

## Testing Strategy

### Per-Phase Testing

After each phase:

1. Run full test suite: `npm test`
2. Fix any broken tests immediately
3. Verify no behavior changes (only structure)
4. Manual smoke test of demo pages

### Test Files to Monitor

- `src/domain/__tests__/domain.test.js`
- `src/engines/__tests__/ProductionEngine.test.js`
- `src/engines/__tests__/EditorEngine.test.js`
- `src/engines/__tests__/resolveMotion.test.js`
- `src/hooks/__tests__/useMotionProject.test.js`
- `src/hooks/__tests__/useMotionInstance.test.js`
- `src/usecases/__tests__/BuildProject.test.js`
- `src/usecases/__tests__/MountMotionInstance.test.js`

### Coverage Requirements

- Maintain 100% test coverage for refactored modules
- Add new tests for factory functions
- Preserve all existing test scenarios

---

## Risk Assessment & Mitigation

### High-Risk Areas

**1. MotionInstance Refactor (Phase 2)**

- **Risk:** Complex lifecycle, many moving parts
- **Mitigation:**
  - Split into small modules first
  - Test each module independently
  - Keep instance API unchanged
  - Gradual migration, one behavior at a time

**2. Subscriber Management**

- **Risk:** Tight coupling to instance lifecycle
- **Mitigation:**
  - Extract to separate module first
  - Preserve exact callback semantics
  - Test subscription/unsubscription thoroughly

**3. Parent-Child Composition**

- **Risk:** Auto-stagger logic is complex
- **Mitigation:**
  - Keep composition logic isolated
  - Preserve stagger calculation exactly
  - Test with existing TowerDefensePage scenarios

### Rollback Strategy

**Per Phase:**

- Each phase is a separate commit (or series of commits)
- Can revert entire phase if issues found
- No dependencies between phases until Phase 2 depends on Phase 1

**Emergency Rollback:**

- Keep `refactor/functional-architecture` branch separate
- Don't merge to main until all phases complete and tested
- Can abandon branch and restart if fundamental issues discovered

---

## Open Questions (Need Approval)

### 1. API Compatibility Level

**Question:** Should external APIs remain 100% identical, or can we improve them during refactor?

**Examples:**

- Current: `project.getMotion(id)` (method call)
- Option A: `getMotion(project, id)` (pure function) - BREAKING CHANGE
- Option B: Keep method syntax via factory pattern - NO BREAKING CHANGE

**Recommendation:** Option B for Phase 1 (domain models), then evaluate.

---

### 2. Helper Function Location

**Question:** Where should helper functions live?

**Options:**

- Option A: Same file as factories (`models.js` has both `createMotionProject()` and `getMotion()`)
- Option B: Separate utilities file (`modelHelpers.js` has all helper functions)
- Option C: Co-located with usage (engines import helper functions they need)

**Recommendation:** Option A (same file) for discoverability.

---

### 3. Immutability Level

**Question:** How immutable should data structures be?

**Options:**

- Option A: Fully immutable (use Object.freeze, return new objects on updates)
- Option B: Pragmatically immutable (don't mutate, but don't enforce with freeze)
- Option C: Mutable where needed (e.g., instance state)

**Recommendation:** Option B (pragmatic immutability) - don't mutate, but don't fight JavaScript.

---

### 4. Instance API Surface

**Question:** Should the instance API be modernized?

**Current API:**

```javascript
const instance = engine.mountInstance("motion-1");
const unsub = instance.subscribe("track-1", callback);
instance.seek(0.5);
instance.destroy();
```

**Potential Modern API:**

```javascript
const instance = engine.mountInstance("motion-1");
const unsub = instance.on("track-1", callback); // EventEmitter-style
instance.seek(0.5);
instance.dispose(); // or keep destroy?
```

**Recommendation:** Keep existing API - no need to break compatibility.

---

### 5. Scope of Refactor

**Question:** Should we refactor everything, or stop after proving the concept?

**Options:**

- Option A: All 4 phases (complete refactor)
- Option B: Phase 1 only, evaluate, decide on Phase 2
- Option C: Phases 1-2 (domain + instances), skip demo page updates

**Recommendation:** Option B - prove Phase 1 works, then commit to Phase 2.

---

### 6. Breaking Changes Acceptable?

**Question:** Are any breaking changes acceptable if they significantly improve the architecture?

**Context:** Some improvements might require breaking changes at the domain model level, but hooks/engine APIs can stay compatible.

**Examples of potential breaking changes:**

- Domain model methods → pure functions (internal, affects engine code)
- Instance internal structure changes (internal, shouldn't affect external API)

**Recommendation:** Internal breaking changes OK, external API must stay compatible.

---

## Implementation Protocol

### Chunked Write Rules (MANDATORY)

- **Maximum 350 lines per operation**
- **Recommended 300 lines or less**
- Split large files across multiple operations
- Use surgical edits for small changes

### Commit Strategy

- One commit per logical unit (e.g., "Phase 1.1: Refactor MotionProject factory")
- Atomic commits that pass tests
- Clear commit messages referencing this plan

### Review Checkpoints

1. After Phase 1: Review before starting Phase 2
2. After Phase 2.1 (split files): Review module structure
3. After Phase 2 complete: Review before Phase 3
4. After all phases: Final review before merge

---

## Success Metrics

### Quantitative

- ✅ 220 tests pass (current count)
- ✅ 0 new test failures
- ✅ 0% decrease in test coverage
- ✅ <5% increase in total lines of code (should be similar or less)

### Qualitative

- ✅ Consistent functional patterns throughout codebase
- ✅ Reduced cognitive load (one paradigm, not two)
- ✅ Improved maintainability (composition over inheritance)
- ✅ External API unchanged (backward compatible)

---

## Timeline Estimate

**Phase 1:** 2-4 hours (8-12 operations)  
**Phase 2:** 6-10 hours (15-25 operations)  
**Phase 3:** 1-2 hours (4-6 operations)  
**Phase 4:** 1-3 hours (5-10 operations)

**Total:** 10-19 hours of implementation + testing time

**Note:** These are conservative estimates assuming careful, methodical work with full test coverage verification.

---

## Next Steps

1. **Review this plan** - Approve/modify/reject
2. **Answer open questions** - Provide decisions on 6 questions above
3. **Create branch** - `git checkout -b refactor/functional-architecture`
4. **Start Phase 1** - Begin with domain model refactor
5. **Checkpoint** - Review after Phase 1 before committing to Phase 2

---

## Appendix: Files Affected

### Phase 1

- `src/domain/models.js` ✏️
- `src/usecases/ParseProjectSchema.js` ✏️
- `src/engines/ProductionEngine.js` 🔍
- `src/engines/EditorEngine.js` 🔍
- `src/engines/resolveMotion.js` 🔍
- `src/domain/__tests__/domain.test.js` ✏️

### Phase 2

- `src/domain/MotionInstance.js` ❌ (delete)
- `src/domain/instance/index.js` ➕ (new)
- `src/domain/instance/base.js` ➕ (new)
- `src/domain/instance/subscribers.js` ➕ (new)
- `src/domain/instance/timeline.js` ➕ (new)
- `src/domain/instance/scroll.js` ➕ (new)
- `src/domain/instance/manual.js` ➕ (new)
- `src/domain/instance/composition.js` ➕ (new)
- `src/usecases/MountMotionInstance.js` ✏️
- `src/engines/__tests__/ProductionEngine.test.js` 🔍
- `src/engines/__tests__/EditorEngine.test.js` 🔍

### Phase 3

- `src/hooks/*.js` 🔍 (verify/minor updates)
- `src/hooks/__tests__/*.js` 🔍

### Phase 4

- `src/components/**/*.jsx` 🔍 (verify only)

**Legend:**

- ✏️ Edit existing file
- ➕ Create new file
- ❌ Delete file
- 🔍 Verify/minor changes

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-13  
**Status:** Awaiting Review & Approval
