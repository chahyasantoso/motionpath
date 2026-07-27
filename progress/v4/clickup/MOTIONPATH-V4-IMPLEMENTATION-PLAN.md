# MotionPath v4: Concrete Implementation Plan

## Review purpose

This is the implementation plan for the 26 concerns identified in the v4 architecture review. It is intentionally concrete: each phase names files, code changes, tests, acceptance criteria, and migration risk.

The plan assumes the team wants to preserve the current public concepts: `Motion`, `Track`, plugins, trigger delegates, layout delegates, React hooks, and zero React re-renders.

## Operating rules

- One phase should land as one reviewable pull request, except Phase 4 may be split into two PRs.
- Every behavior change gets a regression test before refactoring around it.
- Do not mix API migration with cleanup unless the migration has a compatibility test.
- Keep the domain DOM-free.
- Use `npm test` after every PR and add an integration suite before Phase 2.
- Treat the validator and runtime parser as one contract. A schema that validates must load, mount, animate, and destroy successfully.

## Phase 0: Baseline and safety net

**Goal:** make the existing behavior measurable before changing it.

### Step 0.1: Establish the baseline

Files:

- `package.json`
- `src/**/__tests__/**`
- new `src/integration/**`

Actions:

1. Run `npm test` and record the current test count and failures.
2. Add one canonical fixture at `src/integration/fixtures/v4-project.js` containing:
   - one scroll scrub motion,
   - one time motion,
   - one manual motion,
   - one template,
   - one path track,
   - one CSS variable,
   - one image sequence.
3. Add a fake GSAP/ScrollTrigger test adapter only where needed. Do not mock the whole engine.
4. Add an integration test that calls `engine.loadProject`, `mountInstance`, advances the timeline, checks a composed patch, and destroys the instance.
5. Add a teardown assertion that no ScrollTrigger and no GSAP ticker callback remains after destroy.

Acceptance:

- Baseline test command is documented.
- At least one test exercises `Engine -> Motion -> Track -> compose -> renderer`.
- The fixture is reused by later phases.

## Phase 1: Stop production correctness failures

**Goal:** prevent malformed projects, ignored options, and leaked instances from reaching users.

### P1.1: Wire validation into loading, fixes R-01 and R-24 partly

Files:

- `src/engines/Engine.js`
- `src/validators/index.js`
- `src/validators/rules/*`

Implementation:

1. Add `validateProject(schema)` as the first operation in `Engine.loadProject`.
2. Throw one `MotionPathValidationError` containing all errors, paths, and rule ids.
3. Add an explicit option `{ validate: false }` only for trusted internal callers and tests.
4. Extend validation orchestration so top-level `schema.tracks[]` receives the same track rules as motion tracks.
5. Add tests for invalid trigger, invalid stops, duplicate ids, bad template references, and invalid standalone tracks.

Acceptance:

- Invalid schema fails before plugin loading or runtime objects are created.
- Error output contains every violation, not just the first one.
- `validateProject(validFixture)` returns `[]`.

### P1.2: Make `id` authoritative, fix R-02

Files:

- `src/validators/rules/motion-structure.js`
- `src/lib/schema/parseV4Project.js`
- `src/engines/Engine.js`
- `src/domain/types.js`

Implementation:

1. Require `motion.id` and reject `motion.motionId` with a migration-specific error.
2. Remove `motionId` from runtime typedefs.
3. Add a test proving a `motionId`-only project fails validation and cannot mount.
4. Add a test proving an `id` project is retrievable by that exact id.

Acceptance:

- No motion can enter `motionConfigsMap` under `undefined`.
- Runtime, validator, docs, and types all say `id`.

### P1.3: Honor time trigger options, fix R-03

Files:

- `src/lib/TriggerDelegate.js`
- `src/validators/rules/trigger-shape.js`
- `src/domain/types.js`

Implementation:

1. `TimeTriggerDelegate.build()` must use `autoplay`, defaulting to `true` for backward compatibility.
2. Pass `delay` into the timeline config or add it at the timeline level using the documented GSAP behavior.
3. Decide one semantic for `trigger.duration`:
   - preferred: reject it as ambiguous and document that track duration controls animation length;
   - alternative: explicitly use it as a master duration and add tests.
4. Remove ignored fields from the type definition if they are rejected.
5. Add tests for autoplay false, delay, repeat, yoyo, and repeatDelay.

Acceptance:

- `autoplay: false` produces a paused motion.
- Every accepted trigger field is honored or rejected explicitly.
- No accepted field is silently ignored.

### P1.4: Add lifecycle ownership, fix R-04

Files:

- `src/engines/Engine.js`
- `src/hooks/useMotionInstance.js`
- `src/hooks/useScrollMotion.js`
- `src/hooks/useTimeMotion.js`
- `src/hooks/useManualMotion.js`

Implementation:

1. Add `engine.unmount(instance)` that destroys and removes the instance from `#instances`.
2. Make `mountInstance` return an instance with an engine-owned identity separate from schema ids.
3. Have hooks call `engine.unmount(inst)` in cleanup instead of calling `inst.destroy()` directly.
4. Add `engine.adopt(track)` or an engine-owned `createTrackInstance()` for stamped tracks.
5. Make `destroy()` idempotent and verify the map is empty after teardown.
6. Add tests for route-like mount/unmount cycles and stamped track cleanup.

Acceptance:

- Repeated mount/unmount does not grow the instance registry.
- `engine.destroy()` cleans every adopted runtime object exactly once.
- Directly stamped tracks have a documented owner.

### Phase 1 exit gate

- Validation is runtime-enforced.
- `id`, autoplay, and cleanup bugs have regression tests.
- Integration fixture loads, mounts, animates, and destroys.

## Phase 2: Make runtime behavior deterministic

**Goal:** remove order-dependent composition and inconsistent controller APIs.

### P2.1: Break the import cycle, fix R-05

Files:

- new `src/lib/eventBus.js`
- `src/lib/Track.js`
- `src/lib/helpers.js`
- new `src/usecases/mergePatches.js`
- `src/hooks/*`

Implementation:

1. Move `EventBus` and `eventBus` into `lib/eventBus.js`.
2. Move `mergePatches` into a dependency-neutral usecase/module.
3. Remove `helpers.js -> Track.js`.
4. Move `switchToTrack` to a renderer/hook-facing module because it imports `domRenderer`.
5. Run an ESM import smoke test that imports every public module in isolation.

Acceptance:

- No circular import remains between Track and helpers.
- Domain/lib modules can be imported in a non-DOM test environment.

### P2.2: Stabilize plugin ordering, fix R-06

Files:

- `src/domain/createAnimationPlugin.js`
- `src/domain/plugins.js`
- `src/usecases/BuildTrackTween.js`
- `src/usecases/ComposeTrackPatch.js`
- plugin files

Implementation:

1. Add plugin metadata: `stage`, `priority`, and optionally `outputs`.
2. Sort resolved plugins by `stage`, then `priority`, then stable registration order.
3. Detect overlapping output keys during build.
4. Allow overlap only when the plugin declares a merge strategy or explicit priority.
5. Add tests proving object key order no longer changes output.
6. Make path and FK composition conflicts fail with an actionable error unless the schema uses the documented composition mechanism.

Acceptance:

- `{ x, path }` and `{ path, x }` behave identically.
- Unresolved collisions fail at build time.
- Existing path, filter, and FK tests pass.

### P2.3: Unify delegate contracts, fix R-10 and R-11

Files:

- `src/lib/TriggerDelegate.js`
- `src/lib/Motion.js`
- `src/hooks/useManualMotion.js`
- `src/hooks/useMotionTimelinePlayback.js`

Implementation:

1. Define one delegate contract: `build`, `play`, `pause`, `seek`, `reverse`, `onComplete`, `destroy`.
2. Rename `ManualTriggerDelegate.progress` to `seek` and keep `progress` as a temporary deprecated alias.
3. Make `Motion` expose `play`, `pause`, `seek`, `reverse`, and `onComplete` as the only app-facing controls.
4. Keep the delegate private or expose it only through a debug API.
5. Replace optional-chain silent no-ops with descriptive errors for unsupported operations.
6. Update hooks to call `instance.seek()` rather than `instance.trigger.*`.

Acceptance:

- All trigger types share one control API.
- Application code never needs to know the concrete delegate class.
- Missing operations fail loudly in development.

### P2.4: Remove the false timeline normalization, fix R-14

Files:

- `src/lib/Motion.js`
- `MOTIONPATH-V4-SCHEMA.md` or repository docs

Implementation:

1. Remove `addLabel('end', 1)` and its inaccurate comment.
2. Define `stagger` as seconds everywhere.
3. Add a test with tracks longer than one second and nonzero stagger to prove placement is correct.

Acceptance:

- Timeline duration comes from actual child placement and track durations.
- No documentation claims a GSAP label normalizes duration.

### P2.5: Normalize stop percent keys, fix R-17 and R-24

Files:

- new `src/usecases/toPercentKey.js`
- all plugin `contribute()` implementations
- new `src/validators/rules/stop-sequence.js`

Implementation:

1. Add `toPercentKey(p)` with a documented precision, for example six decimal places.
2. Replace every `${p * 100}%` implementation with the helper.
3. Validate monotonic stops, duplicate positions, and missing `p: 0` / `p: 1`.
4. Choose error vs warning severity deliberately: duplicates and unsorted stops should be errors; missing endpoints can be warnings if backward compatibility matters.
5. Add tests around `0.29`, duplicate positions, and unsorted stops.

Acceptance:

- Equivalent numeric positions always produce the same key.
- Duplicate positions cannot bypass ease-collision detection.
- Missing start values are never silently accepted without a warning.

### Phase 2 exit gate

- Composition is independent of JSON property order.
- All trigger controls are uniform.
- Import graph is acyclic in the core.
- Stop positions are deterministic and validated.

## Phase 3: Make extensions safe and renderer-agnostic

**Goal:** stop one plugin from leaking implementation details into the renderer and make plugins first-class extensions.

### P3.1: Make path anchoring explicit, fix R-07

Files:

- `src/domain/plugins/pathPlugin.js`
- path schema validator
- `src/utils/pathUtils.js`

Implementation:

1. Add `path.anchor` with `center` as the compatibility default.
2. Support `none` and explicit `{ xPercent, yPercent }`.
3. Validate the shape and reject conflicting authored anchor fields.
4. Add tests for each anchor mode and migration behavior.

Acceptance:

- Centered path motion remains unchanged by default.
- Consumers can opt out without fighting `applyAnchor`.

### P3.2: Generalize output merging and filters, fix R-08

Files:

- `src/domain/createAnimationPlugin.js`
- `src/usecases/ComposeTrackPatch.js`
- `src/lib/Track.js`
- `src/renderers/domRenderer.js`
- `src/domain/plugins/filterProperty.js`

Implementation:

1. Add output metadata such as `{ merge: 'shallow', serialize }`.
2. Move filter merge behavior out of hardcoded `k === 'filter'` checks.
3. Expand filter serialization from a fixed four-key list or make unsupported keys fail validation.
4. Add plugin-level tests for merge and serialization.

Acceptance:

- Core merge code does not know the filter plugin's key list.
- Adding a structured output does not require editing Track and renderer internals.

### P3.3: Remove renderer knowledge of plugin internals, fix R-09

Files:

- `src/domain/createAnimationPlugin.js`
- `src/domain/plugins/pathPlugin.js`
- `src/renderers/domRenderer.js`
- `src/usecases/ComposeTrackPatch.js`

Implementation:

1. Add `internalKeys` or an internal namespace convention.
2. Have composition return a render-ready patch plus metadata, or have the renderer receive the registered internal-key set.
3. Delete the path-specific denylist.
4. Add a test plugin with a private proxy field and verify it never reaches `gsap.set`.

Acceptance:

- New plugins can define internal state without editing `domRenderer`.

### P3.4: Add plugin registration and lookup indexes, fix R-12

Files:

- `src/domain/plugins.js`
- `src/domain/createAnimationPlugin.js`

Implementation:

1. Add `registerPlugin(plugin)` and `unregisterPlugin(pluginOrKey)`.
2. Use a Map for exact keys and a predicate list for wildcard claims such as CSS variables and path aliases.
3. Detect duplicate claims at registration time.
4. Keep `ALL_PLUGINS` as a compatibility export backed by the registry.
5. Add tests for registration, duplicate claims, lazy loading, and unregister.

Acceptance:

- Third-party plugins can be added without editing the core file.
- Exact key lookup is O(1).

### P3.5: Make image preparation explicit, fix R-18

Files:

- `src/domain/plugins/imageSequenceProperty.js`
- `src/lib/schema/parseV4Project.js`
- plugin contract

Implementation:

1. Remove network/image side effects from `contribute()`.
2. Add `prepare(trackConfig)` or a plugin `load(context)` phase.
3. Collect preparation promises during parse and await them when configured.
4. Add a non-browser fallback and an explicit policy for preload failures.
5. Add a test that compilation does not instantiate `Image` and a browser-like test that preparation is awaited.

Acceptance:

- Compile is pure.
- First-frame popping is either prevented or explicitly reported.

### P3.6: Fix fake version support and types, fix R-19 and R-22

Files:

- `src/domain/types.js`
- `src/validators/rules/schema-version.js`
- `src/validators/rules/motion-structure.js`
- new `src/types/*.d.ts` or migrate to TypeScript

Implementation:

1. Set supported versions to `[4]` unless real v2/v3 migrators exist.
2. Rewrite typedefs against the actual v4 runtime: `id`, `trigger`, templates, tracks, plugin signatures.
3. Add a type-check script.
4. Add a schema fixture that must compile under the published types.

Acceptance:

- Types and runtime agree on every public field.
- Unsupported schemas fail with a clear migration message.

### P3.7: Replace the README and remove dead code, fix R-20 and R-21

Files:

- `README.md`
- `src/engines/engineCore.js`
- v3 branches in `src/hooks/useMotionSubscribers.js`
- migration aliases in `src/usecases/*`

Implementation:

1. Replace v3 README content with v4 onboarding and links to schema/architecture docs.
2. Delete `engineCore.js` if it is not part of the intended v4 runtime, or move it into a complete engine-core design before keeping it.
3. Remove v3 subscriber fallback and compatibility aliases after migration tests pass.
4. Add a short v3-to-v4 migration note instead of embedding old APIs in runtime code.

Acceptance:

- A new engineer following README can run a v4 example.
- No dead module references missing v4 classes.

### Phase 3 exit gate

- Plugins are independently extensible.
- Renderer is not path/filter-specific.
- Types, validator, README, and runtime describe the same v4 contract.

## Phase 4: Add the missing orchestration layer

**Goal:** move spawning, overlays, and lifecycle races out of React demo code.

### P4.1: Define `Spawner`, fix R-13 first half

New files:

- `src/usecases/Spawner.js`
- `src/usecases/__tests__/Spawner.test.js`
- optionally `src/lib/Ticker.js`

Implementation:

1. Define a spawner state machine: `idle`, `running`, `draining`, `complete`, `destroyed`.
2. Inputs: factory, interval or progress gate, max alive, wave size, and completion callback.
3. Drive it from the existing GSAP ticker or an injected clock, never a second RAF loop.
4. Make spawning deterministic under pause, resume, and destroy.
5. Expose events or callbacks for `spawned`, `completed`, and `drained`.
6. Add fake-clock tests for interval, progress gate, max alive, wave reset, pause, and destroy.

Acceptance:

- One clock owns all motion scheduling.
- Spawn timing is testable without a browser.

### P4.2: Define `Overlay`, fix R-13 second half

New files:

- `src/lib/TrackOverlay.js` or `src/usecases/Overlay.js`
- `src/usecases/__tests__/Overlay.test.js`

Implementation:

1. Define `attach(sourceTrack, overlayTrack, mapFn, options)`.
2. Define `replace()` semantics that clear the previous observation before attaching the next one.
3. Make `play()` return a Promise resolved on completion or rejected on destroy.
4. Guarantee cleanup ordering: unsubscribe/remove observation, stop tween, destroy overlay track.
5. Add a generation token so stale entrance completion cannot overwrite a newer exit state.
6. Test fast entrance-to-exit, exit-to-entrance, destroy during animation, and repeated replacement.

Acceptance:

- Consumers no longer hand-roll `setObserved` race guards.
- Destroying an overlay cannot leave a dead observed source attached.

### P4.3: Refactor Spiral and TowerDefense

Files:

- `src/components/Spiral/useSpiralWaveController.js`
- `src/components/TowerDefense/**`
- related component tests

Implementation:

1. Replace the RAF loop with `Spawner`.
2. Replace entrance/exit code with `Overlay`.
3. Route stamped tracks through Engine ownership or an explicit scope owner.
4. Remove hot-path console logging.
5. Preserve user-visible behavior with integration tests.
6. Measure source reduction: each controller should lose at least 100 lines without moving complexity into another component.

Acceptance:

- No component directly manages observation lifecycle.
- No component creates a second scheduling loop.
- Fast interaction tests pass.

### P4 exit gate

- Spiral and TowerDefense behavior is unchanged in demos.
- Spawning and overlays are independently unit tested.
- All dynamically created tracks have a clear owner and teardown path.

## Phase 5: Performance and multi-project hardening

**Goal:** make the engine scale and remove singleton constraints.

### P5.1: Coalesce subscriber writes, fix R-15

Files:

- `src/hooks/useMotionSubscribers.js`
- new `src/renderers/flushScheduler.js`

Implementation:

1. Buffer latest patches per subscriber.
2. Schedule one flush on the current GSAP tick.
3. Merge all source patches once, then call the renderer once.
4. Ensure unsubscribe cancels pending work where appropriate.
5. Add a test asserting one DOM write for N source updates in one tick.

### P5.2: Add renderer dirty checking, fix R-16

Files:

- `src/renderers/domRenderer.js`
- filter serializer
- image sequence plugin

Implementation:

1. Keep a WeakMap of last applied values per DOM target.
2. Shallow-compare scalar properties and structured outputs.
3. Skip unchanged writes.
4. Cache image sequence frame strings by frame index.
5. Add tests for unchanged patch, changed patch, filter changes, and node cleanup.

### P5.3: Remove global mutable runtime state, fix R-23

Files:

- `src/engines/Engine.js`
- `src/lib/eventBus.js`
- `src/domain/plugins.js`
- `src/lib/TriggerDelegate.js`
- hooks and app bootstrap

Implementation:

1. Make `new Engine({ plugins, triggerDelegates, eventBus })` the primary API.
2. Keep singleton exports only as convenience defaults.
3. Scope event buses to an Engine or Motion instance.
4. Scope lazy-load caches to a plugin registry.
5. Add a test running two independent projects simultaneously with no cross-events or cross-destroy.

Acceptance:

- Two engines can coexist safely.
- Tests no longer need global reset functions for isolation.

### P5 exit gate

- Subscriber writes are coalesced and dirty-checked.
- Two projects can run in one page without shared mutable state.
- Performance is measured against the Phase 0 fixture.

## Cross-cutting issue: error handling, fix R-25

Apply through all phases:

1. Add a dev-gated logger with context: project id, motion id, track id, lifecycle stage.
2. Replace swallowed destroy errors with a recorded warning or aggregated teardown error in development.
3. Remove production hot-path `console.log` calls.
4. Add tests asserting cleanup errors do not hide the primary error.

## Cross-cutting test matrix, fix R-26

Add integration coverage for:

1. Valid project load and mount.
2. Validation failure before plugin loading.
3. Scroll scrub progress to DOM patch.
4. Time autoplay false and resume.
5. Manual seek.
6. Template resolution.
7. Path plus transform collision.
8. FK chain and cycle safety.
9. Stamped track cleanup.
10. Overlay replacement during entrance.
11. Spawner pause and destroy.
12. Two simultaneous Engine instances.

## Concern-to-phase map

| Concern | Phase | Deliverable |
|---|---:|---|
| R-01 validator not wired | 1 | validation in `Engine.loadProject` |
| R-02 id vs motionId | 1 | authoritative `id` |
| R-03 ignored time options | 1 | explicit autoplay/delay/duration semantics |
| R-04 instance leaks | 1 | `unmount`, adoption, idempotent destroy |
| R-05 import cycle | 2 | extracted event bus/merge utility |
| R-06 plugin order | 2 | priority/stage and collision errors |
| R-07 path anchoring | 3 | explicit path anchor |
| R-08 filter hardcoding | 3 | output metadata/serializer contract |
| R-09 renderer denylist | 3 | plugin-declared internal keys |
| R-10 delegate mismatch | 2 | unified delegate API |
| R-11 public delegate leak | 2 | Motion control facade |
| R-12 closed plugin registry | 3 | register/unregister and indexed lookup |
| R-13 missing orchestration layer | 4 | Spawner and Overlay |
| R-14 false timeline label | 2 | remove label, document seconds |
| R-15 multiple DOM writes | 5 | flush scheduler |
| R-16 no dirty checking | 5 | renderer cache |
| R-17 float percent keys | 2 | shared percent-key helper |
| R-18 image preload side effect | 3 | explicit prepare phase |
| R-19 stale types | 3 | v4 types or `.d.ts` |
| R-20 stale README | 3 | v4 onboarding docs |
| R-21 dead code | 3 | delete v3 remnants |
| R-22 fake version support | 3 | v4-only validation or real migrators |
| R-23 global singletons | 5 | injectable Engine dependencies |
| R-24 weak stop validation | 2 | stop sequence rule |
| R-25 swallowed errors/logging | cross-cutting | contextual teardown logging |
| R-26 no integration tests | 0, then every phase | end-to-end regression suite |

## Recommended review order

Review Phase 1 first. It is not small: it changes the runtime trust boundary, lifecycle ownership, and time semantics. Do not begin Spawner/Overlay work until Phase 1 and the integration suite are green. The plan has 26 findings because several are architectural seams, not isolated one-line bugs; the code changes are intentionally staged so each phase leaves the system more predictable than it found it.
