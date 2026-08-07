# MotionPath v5 implementation review

**Review date:** 2026-08-07 20:03 Asia/Jakarta  
**Reviewed base:** `v5` after PR-10 merge  
**Head SHA:** `5f60c40852554b0992a1a4b00310b138cd212fa8`  
**Scope:** PR-00 through PR-10, source and CI evidence available in the repository

## Executive verdict

The implementation is **directionally correct and safely sequenced**, but it is not yet production-complete. The strongest parts are lifecycle ownership, graph transaction rollback, deterministic patch/clock contracts, and staged shadow validation. The largest remaining risks are contract drift between documentation and code, incomplete activation of the new runtime path, shallow patch immutability, and the fact that PR-08 tests are live-style group-host fixtures rather than the actual Spiral React controller path.

**Recommendation:** continue the staged migration. Do not enable publisher rendering by default, delete compatibility code, or claim final architecture completion yet.

## What is correct

### PR-00 to PR-01: guardrails and baseline

CI, baseline command, artifact upload, and branch-trigger behavior are in place. The baseline job is intentionally non-blocking, which matches the implementation plan. No runtime behavior was changed.

### PR-02: lifecycle ownership

The ownership chain is now explicit: `Motion -> GraphBinding -> GraphPublisher`. Disposal is idempotent, failed mount cleanup is covered, lifecycle hooks and graph guards are detached, and the publisher releases its own references without mutating a caller-owned Map. This is a real correctness improvement, not just cleanup.

### PR-03: graph transactions

The graph layer now validates candidate state before commit, copies track registries, checks graph and track membership in both directions, rolls live wiring back after failed mutation, uses one topological sorter, and rejects ignored retry options. The test suite covers unknown sources, duplicate IDs, cycles, partial wiring failure, publisher rejection, and deterministic order. This is the strongest phase so far.

### PR-04 to PR-06: runtime and patch contracts

The runtime is addressable, disposable, clock-driven, and opt-in. Patch revisions are deterministic, source progress and revisions are recorded, flushes are batched, and wildcard subscribers see one completed snapshot instead of half-flushed state. The old composer remains the default, which is the correct rollback posture.

### PR-07 to PR-08: shadow evidence

Fixture shadow comparison is strict about structure, keys, roles, statuses, and invalidation timing while allowing documented numeric tolerance. The temporary compatibility adapter preserves the old host as authority and the shadow tests cover spawn, pop, reflow, seek, reverse, and churn patterns. Checkpoint B is valid for the evidence that is actually committed.

### PR-09 to PR-10: compatibility and composite ownership

Autoplay behavior is explicit and preserves the current default of `true`; manual controls remain available. Motion now owns scheduler maps and child slots directly, and child removal no longer depends on the TrackGroup owner. Disposal races and dynamic child lifecycle are covered.

## Findings to fix before later migration gates

### 1. Patch immutability is only shallow

`PatchRegistry` freezes the patch, `values`, and `sourceRevisions`, but nested objects inside `values` remain mutable. The architecture contract says patches are immutable. Either deep-freeze the supported patch value shape or clone/freeze through a documented immutable-value utility before PR-06/PR-16 is treated as production-capable.

**Severity:** medium, contract gap.  
**Owner phase:** PR-06 follow-up or PR-16 hardening.

### 2. GraphRuntime is not yet wired into Engine/Motion production flow

The runtime boundary is exported and tested directly, but Engine mounting still constructs the old Motion/group-host path and does not create a GraphRuntime for normal mounted motions. This is correct for the staged migration, but it means the publisher path is an addressable experimental boundary, not an active rendering architecture.

**Severity:** intentional limitation, high migration importance.  
**Exit condition:** PR-06 through PR-08 evidence plus an explicit integration flag and React subscription path.

### 3. PR-08 is live-style, not actual Spiral-controller integration

The committed tests reproduce Spiral operations with Engine, GroupHost, and dynamically added tracks. They do not mount and drive `useSpiralWaveController` itself. The report should call this "Spiral-style live shadow" until the actual controller path is exercised. Before treating the result as final product evidence, add an integration test around the real controller or document why the controller cannot run in the core CI environment.

**Severity:** medium evidence gap.  
**Owner phase:** PR-08 follow-up or integration test before PR-09/PR-11 claims.

### 4. Public exports expose migration internals

The core package root exports `GraphRuntime`, `MotionRuntime`, `PatchRegistry`, and graph utilities. The accepted architecture says graph internals should not be exposed from the package root. Keep these exports testable through an internal entrypoint or mark them explicitly experimental until PR-20 applies the public exports map.

**Severity:** medium API-boundary gap.  
**Owner phase:** PR-20, with interim documentation.

### 5. Repeated active Motion initialization remains fragile

`Motion.init()` destroys an active Motion, and destruction clears the initial track list. A second initialization therefore cannot reconstruct the original tracks unless the caller remounts them. This was already identified as a known gap and remains outside PR-10's full proof. It must be repaired or explicitly prohibited before the composite is considered stable.

**Severity:** high lifecycle edge case.  
**Owner phase:** PR-10 follow-up or PR-09/PR-13 compatibility gate.

### 6. Nested Motion scheduling is not implemented yet

PR-10 makes Motion the direct owner for Track scheduling, but Motion still schedules Track instances only. Arbitrary-depth Motion nesting, parent-relative offsets, and recursive disposal remain unproven. This is expected: the recursive scheduler proof belongs to PR-13.

**Severity:** planned gap, not a regression.  
**Owner phase:** PR-12/PR-13.

### 7. GSAP remains in core before ports are introduced

The architecture target requires Interpolator, Scheduler, and Clock ports with GSAP isolated under adapters. Current Motion, Track, and trigger code still import GSAP directly. This is expected before PR-12, but no core-level claim of renderer independence should be made yet.

**Severity:** planned gap.  
**Owner phase:** PR-12.

## Sequencing and optimization verdict

The sequencing is good: lifecycle and transaction safety came before runtime ownership, clock/patch contracts came before publisher enablement, and fixture evidence came before the compatibility shadow. That order minimizes rollback risk.

The implementation is not yet optimal in runtime performance. Current `GraphPublisher` downstream invalidation scans every upstream list for every seed, and `PatchRegistry` snapshots all patches on each publish to build source revision metadata. Those are acceptable for the migration proof, but should not be optimized prematurely. Measure them after PR-08/PR-16 evidence is stable, then consider downstream indexes and incremental revision bookkeeping under PR-21.

Avoid broad refactors now. The right next moves are narrow: preserve the compatibility bridge, prove actual controller integration, harden patch immutability, then isolate GSAP behind ports and prove recursive scheduling.

## Gate status after PR-10

- **Checkpoint A:** passed after PR-03.
- **Checkpoint B:** passed after PR-08, based on committed live-style Spiral shadow evidence.
- **Checkpoint C:** not passed. PR-11 must delete the migration adapter and dead graph-order plumbing after the remaining evidence is accepted.
- **Default rendering migration:** not enabled.
- **Nested GSAP spike:** not run and not accepted.

## Recommended next session

1. Re-read this report and `docs/V5-STATUS.md`.
2. Decide whether to add the actual Spiral controller integration before PR-11, or explicitly record the environment limitation.
3. Keep `CompositeRuntime` alive until that evidence and the Motion compatibility gate are accepted.
4. Before PR-16, deep-freeze patch values and narrow the public exports.
5. Continue with PR-11 only as a deletion PR, not a mixed refactor.
