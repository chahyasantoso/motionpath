# PR #145 senior implementor review

**Reviewed:** 2026-08-09 18:34 Asia/Jakarta  
**PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Head:** `ddcc3ffbc6c1d51d18755c90b56c880fe5c7d8e7`  
**Base:** `v5` at `e4fc9b961b0f54935ec53c44d9b24c8e560a12d3`  
**Scope observed:** 49 files, 2,807 additions, 1,053 deletions, 193 commits  
**Verdict:** do not merge. The architectural direction is mostly right, but the exact head has a red unit gate and several ownership, compatibility, lifecycle, typing, and gate-integrity defects.

## Executive assessment

The useful part of this batch is real: Track-local observation maps and the publisher-owned cycle guard are gone, authored graph mutation is routed toward ObservationState, strict boundary and benchmark jobs are blocking, and ProjectRuntime now owns a standalone adapter lifetime.

The implementation is not a completed P2-03 migration. `createTrack` still installs the legacy facade on every returned Track, including authored-graph Tracks created by Engine. Direct legacy mutation silently moves Tracks between owners. GraphBinding can leave the old standalone owner alive behind its authoritative state, allowing stale edges to reappear after unbinding. The two advertised ownership modes are aliases of the same class, so the parity suite and rollout flag do not test or select independent behavior.

CI confirms the branch is not releasable: 18 checks ran because push and pull-request workflows both executed; both unit-test jobs failed, while the other 16 jobs passed. The duplicate matrix also contradicts docs that expect nine jobs.

## Evidence reviewed

- Complete PR metadata, changed-file inventory, and diff for all 49 files.
- Current `V5-STATUS.md`, handoff, completion matrix, symbol-ban, architecture plan, and package scripts.
- Exact PR head checks: two failing `unit tests (node 24)` jobs; format, typecheck, build, package, default boundary, strict boundary, rig benchmark, and baseline jobs passed in both workflow runs.
- Existing review discussion: no review threads or PR discussion currently record these issues.

## P0 findings

None proven from the diff alone. No evidence of arbitrary code execution, credential exposure, or irreversible persisted-data corruption was found.

## P1 findings, merge blockers

### P1-01, the exact head is red

Both unit-test jobs fail on `ddcc3ff`. A passing typecheck, build, package dry run, scanner, and benchmark cannot override a red correctness suite.

**Required fix:** identify the failing test cases from the job log, reproduce them locally on Node 24, fix behavior rather than expectations, and rerun the exact merge ref. Do not merge until one non-duplicated matrix is fully green.

### P1-02, the legacy facade still ships on production authored Tracks

`createTrack` unconditionally calls `installLegacyObservationFacade(...)`. Engine uses `createTrack` for authored-graph Tracks, so those leaf objects still receive `setObserved`, `removeObserved`, `replaceObserved`, `observedSources`, `observedEdges`, `observerCount`, and `observerIds`.

This passes the strict scanner because the scanner checks only source text in `Track.js`, not the runtime surface created by the factory. The status claim that compatibility is explicit is therefore too strong.

**Required fix:** make facade installation an explicit compatibility option or separate legacy factory. Engine authored paths must construct leaf Tracks without the facade. Add a runtime boundary test that inspects an Engine-authored Track and proves banned properties are absent.

### P1-03, cross-scope adoption can silently delete live edges

The facade calls `_adoptObservationOwner` on endpoints. Track then unregisters itself from its previous adapter before registering with the new one. Unregister removes incoming and outgoing edges from the old owner.

A Track already connected in scope A can therefore be used by a mutation in scope B and silently disconnect scope A. This is ownership transfer disguised as edge mutation, with no error, transaction, or rollback.

**Required fix:** never migrate ownership implicitly. Reject cross-owner edges with a descriptive error. If transfer is required, expose an explicit transactional transfer operation that validates the Track is detached, snapshots state, moves it, and rolls back on failure. Add a two-scope regression where a shared endpoint already has incoming and outgoing edges.

### P1-04, GraphBinding can retain a stale second owner

When GraphBinding is created without `initialEdges`, it snapshots edges from each Track's current owner and installs an ObservationState-backed controller. It does not detach or invalidate the old standalone owner. Subsequent GraphBinding mutations update only ObservationState.

When the binding is destroyed, `_setObservationController(null)` reveals the old adapter again. Pre-binding edges can reappear and post-binding changes can disappear. This is a dual-source-of-truth bug, not just architectural untidiness.

**Required fix:** use an explicit ownership-transfer protocol. Authored Tracks should enter GraphBinding with no standalone owner, or GraphBinding must consume and clear the previous owner atomically. Add a bind, mutate, unbind regression that proves stale edges cannot resurrect.

### P1-05, remove compatibility mutation no longer emits lifecycle invalidation

`LegacyObservationFacade.removeObserved` delegates to the owner and returns. Unlike add, replace, and clear, it emits neither `edge-removed` nor `invalidated`. The old Track implementation invalidated observation changes.

Subscribers and publishers can therefore retain a stale composed patch after a legacy edge removal.

**Required fix:** snapshot the removed edges, perform the mutation, emit one `edge-removed` event per removed edge, then emit one observation invalidation. Lock this with a publisher-facing regression.

### P1-06, the destroyed lifecycle event dropped `observerIds`

The old Track emitted `{ type: "destroyed", track, observerIds }`. The new Track still sends observer IDs through `onSourceDestroyed`, but its general lifecycle `destroyed` event omits them.

That is an observable contract regression for lifecycle subscribers and is not called out as an intentional API change.

**Required fix:** preserve `observerIds` on the destroyed lifecycle event, or version and document the contract removal with consumer migration evidence.

### P1-07, ownership parity is tautological

`StandaloneObservationAdapter` is now a re-export alias of `ScopedObservationAdapter`. ProjectRuntime's `compatibility` and `scoped` modes therefore instantiate the same implementation. The large parity suite runs the same class twice and cannot detect divergence between old compatibility behavior and the new scoped owner.

The `observationOwnership` rollout flag currently changes a label and constructor symbol, not behavior. It cannot provide a meaningful rollback.

**Required fix:** choose one honest model. Either retain an independent compatibility implementation until migration evidence is complete, or remove the fake two-mode rollout and document the one-way breaking change. Do not claim parity based on aliases.

### P1-08, GraphBinding late-track wiring can mutate owner state twice

`GraphBinding.addTrack` installs the controller, optionally calls an overridden `track.setObserved`, and then calls `controller.setObserved` again. A facade method resolves the controller as its owner, so delegating overrides can write the same edge twice and emit compatibility lifecycle events during an authored transaction.

This mixes the fault-injection seam with production mutation and weakens rollback evidence.

**Required fix:** authored wiring must call only the owner/controller. Inject failures at the controller or publisher boundary in tests. Keep legacy hook testing in the compatibility module, not in GraphBinding transactions.

### P1-09, the format gate is still not a source-format gate

`format:check:ci` checks only `package.json` and `.github/workflows/ci.yml`. It does not check source, tests, scripts, or docs. Large one-line rewrites in GraphBinding, ProjectRuntime, the boundary scanner, and tests can pass the green format job.

This directly contradicts the symbol-ban prerequisite that the format gate cover source files.

**Required fix:** run Prettier over the intended repository surfaces, with explicit exclusions for generated or vendored content. Keep readability tests as a separate semantic guard.

### P1-10, the public TypeScript surface is incomplete

The JS entry point exports `createObservationScope`, but `motionpath.d.ts` does not declare it or a usable scope/runtime interface. Tests also construct Engine with `projectRuntime`, while `EngineOptions` omits that option.

JS consumers can use new APIs that TypeScript consumers cannot type safely.

**Required fix:** declare `ObservationScope`, `createObservationScope`, the disposable adapter-facing contract, and `projectRuntime` if it is supported. If injected runtimes are internal only, stop testing them as public Engine options and hide the seam.

## P2 findings, required before declaring P2-03 complete

### P2-01, CI runs twice per PR

The same head produced push and pull-request matrices, giving 18 jobs instead of the documented nine. This wastes capacity and makes required-check interpretation noisy.

**Solution:** use pull-request validation for feature branches and push validation for protected branches, or add concurrency and event guards that guarantee one authoritative matrix per head.

### P2-02, direct construction still has two contradictory defaults

`new Track()` creates a fresh adapter per Track. `createTrack()` falls back to a module-global `defaultProjectRuntime`. Related direct Tracks therefore behave differently depending on which constructor surface was used.

**Solution:** require a caller-owned scope for owner-first APIs. Keep legacy fallback behind an explicitly named compatibility entry point, with a deprecation plan and isolation tests.

### P2-03, Engine destroy changes runtime identity and may discard configuration

Engine destroys its current ProjectRuntime and immediately creates a new one preserving only `observationOwnership`. An injected runtime is replaced, and capabilities such as `crossMotion` and `freeTracks` are not preserved.

**Solution:** define ownership of injected runtimes. Prefer terminal `destroy()` semantics. If reset is required, add a separate `reset()` that rebuilds from a complete immutable runtime configuration.

### P2-04, Track still depends on the legacy facade module

Track imports `createDestroyEvent` from `LegacyObservationFacade`. The leaf is therefore source-coupled to the compatibility layer even though facade installation moved out of its constructor.

**Solution:** move lifecycle event construction into a neutral contract module or construct the small event object in Track.

### P2-05, the strict scanner proves source absence, not runtime absence

The scanner strips comments and checks banned literals only in `Track.js`. It does not inspect factories, decorators, `Object.defineProperties`, package exports, or an instantiated Track surface.

**Solution:** keep the static scan, then add a runtime symbol-ban test over direct, factory-created, Engine standalone, and Engine authored Tracks. Define which compatibility entry points are exempt.

### P2-06, broad scope and historical churn make review evidence weak

This P2-03 PR contains 193 commits and changes CI, docs, runtime ownership, public exports, types, core graph transactions, lifecycle, benchmarks, scanners, fixtures, and a large test suite. Several docs in the same diff describe older PR heads and superseded failures.

**Solution:** stop adding architecture changes to #145. Stabilize it with focused corrective commits, then split unrelated CI/history cleanup if practical. The final report must describe the exact merge head only.

### P2-07, docs overstate completed behavior

The current status says direct callers are migrated through explicit adoption, strict gates are repaired, and compatibility is explicit. It does not record the duplicate CI matrix, red unit gate, unconditional factory facade, alias-based parity, or stale-owner resurrection risk.

**Solution:** use the corrected status, handoff, and completion matrix committed with this review. Mark a row complete only with green evidence on the exact head.

## What is good and should be preserved

- Track-local forward and reverse observation maps were removed.
- GraphPublisher no longer owns a Track-walking cycle guard.
- ObservationState is now the intended authored mutation and cycle authority.
- Strict boundary, benchmark, build, typecheck, and package checks are blocking and pass on the reviewed head.
- Owner-scoped identity keys isolate duplicate public IDs inside one adapter.
- Rollback tests preserve mapper functions in covered add, remove, and replace failures.
- Default product behavior remains conservative for publisher rendering, cross-motion, and free tracks.

## Required remediation order

1. Fix the red unit suite on Node 24 and remove duplicate CI execution.
2. Make compatibility facade installation opt-in; prove authored Engine Tracks have no banned runtime surface.
3. Reject implicit cross-owner adoption and implement explicit ownership transfer if needed.
4. Eliminate stale dual ownership when GraphBinding takes authority.
5. Restore remove and destroy lifecycle contracts.
6. Remove double mutation from GraphBinding late-track wiring.
7. Decide whether compatibility and scoped are genuinely separate. Remove the fake rollout if not.
8. Complete TypeScript declarations and make the format gate cover source.
9. Run focused lifecycle, ownership-transfer, rollback, duplicate-ID, cycle, disposal, and unbind tests.
10. Run one complete Node 24 matrix on the exact merge ref, then refresh all status claims.

## Merge criteria

- One authoritative CI matrix, all jobs green on the exact merge ref.
- No production authored Track receives legacy observation methods or read properties.
- Cross-owner mutation cannot silently move a Track or delete another scope's edges.
- Binding and unbinding cannot resurrect stale adapter state.
- Add, remove, replace, detach, destroy, and rollback emit the documented lifecycle and invalidation events.
- Ownership modes either use independent implementations with meaningful parity evidence or are collapsed into one documented mode.
- Runtime symbol-ban, source format, static boundary, typecheck, build, package, benchmark, and full unit gates all pass.
- Status, handoff, completion matrix, and this review reference the final head and agree on what remains open.
