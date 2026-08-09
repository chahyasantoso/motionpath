# P2-03 implementor review, 2026-08-09

**Reviewed head:** `32ada3eede0c3044707b47026a43818ca6453c16`  
**PR:** [#143](https://github.com/chahyasantoso/motionpath/pull/143)  
**Base:** `v5` at `e4fc9b961b0f54935ec53c44d9b24c8e560a12d3`  
**Review status:** all 8 visible Node 24 checks green; PR remains draft and P2-03 is not complete.

## Executive verdict

The implementation is a credible compatibility repair and the green suite is meaningful: adapter parity, runtime integration, GraphBinding rollback, source cleanup, readability, build, typecheck, packaging, and boundary reporting all pass. It is not yet a finished ownership refactor because compatibility behavior is still installed dynamically on every Track, the strict boundary is not part of the visible CI matrix, the publisher still contains a second cycle guard, and the repository documents several pre-refactor truths as if they were current.

Do not merge this as “P2-03 complete” yet. Merge only after the closure criteria below are landed and the strict gate runs on the exact merge ref.

## Findings

### P0, none

No failing green-gate bypass or obvious data-loss defect was found in the reviewed implementation.

### P1, close before calling P2-03 finished

#### P1-01, the Track symbol-ban is reported, not enforced

`Track.js` no longer owns the edge maps, which is good, but the public compatibility names are still installed on every Track by `LegacyObservationFacade`. The strict scanner currently strips comments and scans only `Track.js`, so the scanner can report Track clean while the runtime still exposes `setObserved`, `removeObserved`, `replaceObserved`, `observedSources`, `observedEdges`, `observerCount`, and `observerIds` on every Track.

**Why it matters:** the architectural target is a leaf Track, but the current code still makes Track the public compatibility entry point and keeps the migration seam alive indefinitely.

**Required fix:** migrate every production caller to `ObservationTrackController` or an explicit adapter, move legacy API coverage into a separately tested compatibility module, then delete `installLegacyObservationFacade(this)` from Track construction. Keep any compatibility wrapper outside the Track object only if the public API contract explicitly requires it.

#### P1-02, strict P2-03 is not a CI gate

The current workflow runs `boundary:v5:pass2`, but repository search found no `boundary:v5:pass2:strict` invocation in CI. The handoff explicitly requires both, while the PR body lists only the non-strict scan.

**Why it matters:** the green board proves the default report runs, not that the completion condition is enforced. This is exactly the gate-integrity problem the handoff warns about.

**Required fix:** add a blocking strict-boundary job to `.github/workflows/ci.yml`, run it on pull requests, and verify it scans the merge ref. Do not rely on a developer-only command.

#### P1-03, direct Track fallback is still process-global

`defaultProjectRuntime.js` exports one module singleton, and `Track` plus `createTrack` use its adapter when no runtime injects one. Engine-created Tracks are correctly scoped, but direct `new Track()` and direct `createTrack()` callers still share the singleton adapter across unrelated owners.

**Why it matters:** this contradicts the handoff statement that process-global compatibility state is gone and reintroduces cross-test or cross-consumer leakage through the compatibility path.

**Required fix:** make direct construction use an explicit caller-owned compatibility scope, or provide a clearly documented short-lived factory scope. Add a test proving two independent direct-construction scopes with duplicate IDs cannot observe each other, then remove the singleton fallback if the public API permits it.

#### P1-04, cycle validation still has multiple authorities

`ObservationState` validates cycles, and `GraphPublisher` still contains `#graphGuard` that walks Track observation edges and is installed through `_setGraphGuard` in the legacy facade. The symbol-ban document says cycle rejection should have one owner, but the implementation retains two production validators plus normalization-time validation.

**Why it matters:** different mutation paths can accept or reject the same graph differently, and the legacy guard keeps GraphPublisher coupled to Track compatibility behavior.

**Required fix:** make `ObservationState` or one graph service the single runtime cycle authority. Remove GraphPublisher’s Track-walking guard and the `_setGraphGuard` path after migrating its tests to the owner state.

### P2, fix in the next cleanup slice

#### P2-01, state-first and compatibility projection are still dual-write

GraphBinding mutates ObservationState and then calls the compatibility facade, with rollback logic that tolerates an already-applied replacement. This is a pragmatic bridge, not a final ownership model.

**Required fix:** delete the compatibility mutation call from authored GraphBinding paths. Keep only state mutation, controller reads, and lifecycle events emitted from the owner. Retain rollback tests that assert state, live composition, publisher order, and mapFn restoration.

#### P2-02, standalone and authored lifecycle contracts are split

Source cleanup is handled by the standalone adapter, ObservationStateBridge, Track destroy, and GraphBinding lifecycle hooks. The tests cover the known cases, but teardown authority is distributed across four layers.

**Required fix:** define one lifecycle owner per mode, document ordering, and add repeated destroy/detach tests that prove no duplicate cleanup, no stale observer IDs, and no post-disposal composition.

#### P2-03, repository status docs are stale at the green head

The handoff still says verification is pending at `7f04915`, the completion matrix still says Track and ObservationState ownership are open, and the implementation report still points to the old fix head. Those statements were accurate mid-session, not at the reviewed head.

**Required fix:** update `V5-STATUS.md`, `V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`, `V5-PASS-2-COMPLETION-MATRIX.md`, and the implementation report to the actual reviewed commit and checks. Mark only evidence-backed rows complete.

#### P2-04, the fuzz timeout fix needs performance evidence

The cache fuzz test now has an explicit 15-second timeout for 2,000 generated scenarios. That is reasonable as a test budget, but it can hide a regression if the underlying path slows further.

**Required fix:** keep the timeout, but record runtime before and after the public-ID index optimization and add a smaller deterministic performance assertion or benchmark threshold outside the correctness test.

#### P2-05, type and runtime docs disagree on compatibility ownership

The public type comment still describes `compatibility` as using a process-wide registry, while the compatibility adapter implementation is now the scoped implementation behind the legacy name. This will mislead the next implementor and consumers.

**Required fix:** update the type/docs wording to say compatibility is the legacy API surface and scoped runtime ownership is selected by `ProjectRuntime`; remove “process-wide” unless that remains intentional.

## What is actually complete

- Engine-created standalone Tracks share the injected ProjectRuntime adapter.
- Scoped ownership is explicit and parity-tested against compatibility behavior.
- Duplicate public IDs are isolated inside scoped adapters.
- ObservationState carries authored graph edges after hydration.
- GraphBinding rollback preserves edge metadata and mapper functions in the covered paths.
- Source-destroy observer snapshots and dependent cleanup are covered.
- Track-local edge and reverse maps are gone.
- The 15-second cache fuzz budget prevents the known 5-second false failure.
- The current eight visible Node 24 checks are green.

## Finish criteria

P2-03 is finished only when all of these are true on the exact merge ref:

1. No Track instance receives the legacy observation methods or read properties from its constructor.
2. No production caller uses the legacy Track observation names.
3. ObservationState/controller is the sole authored mutation and cycle authority.
4. Direct standalone construction has an explicit, non-singleton lifetime boundary, or the singleton fallback is explicitly accepted and documented as a compatibility exception.
5. Repeated add, remove, replace, detach, destroy, rollback, duplicate-ID, cycle, and disposal tests pass in both ownership modes.
6. `npm run boundary:v5:pass2:strict` is a required PR check, not a manual command.
7. Build, full tests, typecheck, package check, default boundary, and strict boundary all pass.
8. Status, handoff, matrix, and report docs match the reviewed head and do not claim stale “pending” or “open” states.
9. P2-04 topology/playback removal remains separate and is not smuggled into this closure.

## Recommended order

1. Add the strict CI job and refresh the status docs.
2. Remove the singleton direct-construction fallback or make its exception explicit with isolation tests.
3. Migrate remaining callers and delete the Track-installed facade.
4. Remove GraphPublisher’s Track cycle guard and make ObservationState the sole authority.
5. Collapse authored GraphBinding dual-write into owner-only mutation.
6. Run the full matrix again, then close P2-03. Keep publisher rollout and P2-04 separate.
