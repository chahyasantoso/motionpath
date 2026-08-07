# MotionPath v5 implementation plan

**Status:** execution plan  
**Revision:** 2026-08-07  
**Parent plan:** `docs/V5-ARCHITECTURE-REFACTOR-PLAN.md`  
**Review addendum:** `docs/V5-MIGRATION-REVIEW-ADDENDUM.md`

This document turns the v5 architecture decisions into reviewable pull requests with explicit ownership, dependencies, CI gates, rollback points, and exit evidence.

## Delivery rules

- One architectural concern per PR. No mixed structural and behavior migrations.
- Every PR has a feature flag or is behavior-preserving by construction.
- Every PR must include tests for success, failure, disposal, and repeated execution where applicable.
- Do not merge a phase because the demo looks correct. Require deterministic tests, shadow comparison, and measured evidence.
- Keep the old composer and group-host path until the replacement has passed shadow mode and the relevant live-demo gate.
- Never remove cycle protection during a rollback.
- No project-wide graph or cross-motion behavior until PR-18.

## Branch and commit conventions

Use short-lived branches from `feat/graph-spiral-demo`:

```text
v5/pr-01-baseline
v5/pr-02-lifecycle
...
v5/pr-20-cleanup
```

Each PR should be squash-merged with a title such as `v5: make graph binding ownership explicit`. Avoid drive-by formatting and unrelated refactors.

## PR sequence

### PR-01: baseline and observability

**Scope:** characterization tests, benchmark harness, feature flags, and CI artifacts. No runtime behavior change.

Add regression fixtures for grandchild offsets, orphaned subtree removal, repeated Motion initialization, mount/unmount churn, failed mount, reload, paused/seeking/reversed timelines, and 10 subscribers over 60 frames. Record compose count, p50/p95 flush time where available, dropped frames, retained objects, test count, build result, bundle size, and package contents.

**CI gate:** unit tests, typecheck, build, pack check, benchmark command, and artifact upload. Baseline failures are allowed only when marked as known characterization failures.

**Merge gate:** baseline report committed under `docs/benchmarks/v5-baseline.json`; feature flags are deterministic and default to the old path.

### PR-02: lifecycle ownership repair

**Scope:** attach the graph binding to its owner, add idempotent disposal, fix failed mount cleanup, and test reload/repeated destroy.

Do not change composition. Keep `GraphPublisher.removeTrack()` until its replacement destroy path is proven. Verify the live graph guard remains installed.

**CI gate:** lifecycle tests, fake-timer churn test, heap-retention smoke test, and failure-injection mount tests.

**Merge gate:** no unreachable binding, no retained publisher/binding after destroy, and no cycle-protection regression.

### PR-03: graph transaction correctness

**Scope:** defensive Map copies, bidirectional graph/track set assertions, atomic `addTrack`, edge invalidation for `removeChild`, edge-added events for `replaceObserved`, one sorter, and removal of ignored retry configuration.

Use prepare, resolve, validate, wire, commit, invalidate. Failed transactions must restore the prior graph and live wiring exactly.

**CI gate:** mutation/property tests for add/remove/replace, unknown source, duplicate ID, cycle, partial failure at each edge index, and rollback after publisher failure.

**Merge gate:** graph IR and live wiring remain equivalent after every successful or failed mutation.

### PR-04: runtime scope boundary

**Scope:** introduce `GraphRuntime` with `register`, `unregister`, `replaceEdges`, `flush`, and `dispose`. Start with one `MotionRuntime` per mounted Motion. Move binding/publisher ownership behind this interface.

Add deterministic `FakeClock`, patch registry, immutable patch revisions, status values (`ready`, `blocked`, `error`), and structured diagnostics.

**CI gate:** contract tests run against fake runtime and current implementation; disposal and rollback tests; no React or GSAP dependency in core runtime tests.

**Merge gate:** runtime is addressable, disposable, and behavior-compatible while the old composer remains authoritative.

### PR-05: patch contract and clock integration

**Scope:** define the immutable patch envelope and clock semantics. A flush happens once per runtime clock tick, never from an individual track callback. Include source progress and source revisions in metadata.

**CI gate:** fake-clock tests for one flush per tick, coalesced invalidations, no half-flushed subscriber state, paused/seeking/reversed sources, and independent schedulers.

**Merge gate:** deterministic patch revisions and no duplicate flushes under bursty invalidation.

### PR-06: publisher path behind a flag

**Scope:** wire the publisher to a real patch registry and React subscription path, but keep the compatibility composer as the default. Preserve the one-argument `compose` callback for user transforms and direct local composition for standalone tracks.

**CI gate:** old/new contract tests, publisher failure isolation, retry behavior, subscriber lifecycle tests, and React integration tests.

**Merge gate:** new path can be enabled and disabled without restart or leaked subscriptions; old path still passes unchanged.

### PR-07: fixture shadow mode

**Scope:** compute old and new patches for the same deterministic fixture and compare values, status, revisions, and invalidation timing without switching rendering.

Use numeric tolerance only for floating-point values. Structural fields, keys, edge roles, and error statuses require exact equality.

**CI gate:** shadow comparison across input/output edges, fan-in, fan-out, multi-level chains, rewiring, retry, failure isolation, and partial transactions.

**Merge gate:** zero unexplained mismatches across repeated seeded runs. Every mismatch is either fixed or explicitly classified as an intentional contract change.

### PR-08: compatibility composite runtime

**Scope:** add temporary `CompositeRuntime` around the existing `TrackGroup` and `createGroupHost()` path. It exposes the same runtime surface as `MotionRuntime` but owns no graph semantics.

This is the missing bridge for the Spiral demo. Phase 3 fixture shadow mode is not considered live-demo validation until this PR lands.

**CI gate:** real Spiral controller integration, spawn/pop/reflow/seek/reverse/destroy shadow comparisons, and churn retention checks.

**Merge gate:** old/new patches match within the documented numeric tolerance and no publisher, binding, track, or scheduler objects remain retained after churn.

### PR-09: manual trigger compatibility

**Scope:** add or normalize the manual trigger contract with explicit `autoplay: boolean`, defaulting to the existing group-host behavior. Preserve seek, pause, reverse, remove, reflow, destroy, and repeated initialization semantics.

**CI gate:** autoplay true/false tests, fake scheduler tests, integration tests against Spiral, and visual snapshot or deterministic state-vector comparison.

**Merge gate:** manual Motion is behavior-equivalent to the compatibility composite for the supported API surface.

### PR-10: collapse composites into Motion

**Scope:** merge `TrackGroup` behavior into `Motion`, replace mirrored collections with one child collection and opaque scheduler slots, build the scheduler in the constructor, and remove `init()`.

Replace `createGroupHost()` with manual-trigger Motion. Keep `CompositeRuntime` in this PR only long enough to support rollback; delete it in PR-11.

**CI gate:** arbitrary-depth nesting fixtures, grandchild offsets, subtree removal, destroy-without-remove, all demo scenes, and public API compatibility tests.

**Merge gate:** only Motion schedules children; no Track owns topology or playback forwarding.

### PR-11: delete migration composite and old graph-order plumbing

**Scope:** delete `CompositeRuntime`, `TrackGroup`, group-host bridge, `composeGraph`, `applyGraphOrder`, and stale graph-order fields only after live shadow evidence is recorded.

**CI gate:** repository search forbids the deleted symbols outside migration notes; full test/build/pack suite; Spiral smoke test.

**Merge gate:** rollback flag still reaches the old composer where required, or the documented rollback point has moved to the last known-good Motion implementation.

### PR-12: ports and adapter isolation

**Scope:** add `Interpolator`, `Scheduler`, and `Clock` ports. Move GSAP imports and ticker integration under `adapters/gsap/`. Core depends only on ports.

**CI gate:** fake-backed core tests run with GSAP unavailable; boundary test rejects GSAP imports outside adapters; package export test rejects raw GSAP objects.

**Merge gate:** no forbidden imports, no GSAP implementation details in core snapshots, and fake ports cover Track, Motion, and publisher behavior.

### PR-13: recursive scheduler proof and implementation

**Scope:** complete the isolated depth-three GSAP spike, then allow Motion to contain Track or nested Motion. Keep offsets parent-relative and disposal recursive.

**CI gate:** depth 1/2/3/10 tests, seek/play/pause/reverse/reflow tests, randomized tree layout tests, and leak checks.

**Merge gate:** arbitrary-depth nesting is deterministic and no orphaned scheduler child survives removal or destroy.

### PR-14: FK input contract

**Scope:** before moving observation ownership out of Track, validate plugin inputs against authored observation edges.

For authored graph mode, required plugin inputs need exactly one compatible edge. Standalone mode may use documented defaults. Add stable diagnostics: `GRAPH_INPUT_MISSING`, `GRAPH_INPUT_UNKNOWN`, `GRAPH_INPUT_DUPLICATE`, and `GRAPH_INPUT_ROLE_MISMATCH`.

For `fkPlugin`, declare `parentWorld` required in graph mode and retain its identity-world default only for standalone mode.

**CI gate:** valid FK chain, missing input, wrong target, duplicate edge, role mismatch, standalone fallback, and qualified-source fixtures.

**Merge gate:** malformed authored rigs fail validation instead of silently falling back.

### PR-15: ObservationGraph extraction

**Scope:** make `ObservationGraph` the only owner of edges, reverse indexes, cycle validation, and topological order. Move graph mutation semantics out of Track and keep standalone local composition explicit.

**CI gate:** graph model contract tests, cycle tests, mutation rollback tests, compatibility-mode cycle protection, and no Track observation state assertions.

**Merge gate:** Track is a leaf; every enabled runtime path has one cycle-validation owner.

### PR-16: publish-only same-motion runtime

**Scope:** make publisher output the only composition path for adopted same-motion nodes. React reads patches; standalone tracks retain direct local composition.

**CI gate:** compose-once-per-node-per-tick assertion, shared-source fan-out test, subscriber-count scaling test, shadow mode, and failure isolation.

**Merge gate:** same-motion rendering is publisher-backed with no per-subscriber recursive composition.

### PR-17: project membership and qualified IDs

**Scope:** introduce typed registries for motions, tracks, and free objects; define qualified IDs (`motionId/trackId`) and reserved free-track IDs (`~/trackId`). Bare authored IDs remain motion-local.

**CI gate:** duplicate qualified IDs, namespace collisions, stable ordering, remount equivalence, and public lookup tests.

**Merge gate:** project membership is explicit and deterministic, but cross-motion capability remains disabled.

### PR-18: ProjectRuntime and staged visibility

**Scope:** replace motion-scoped runtime ownership with one ProjectRuntime per loaded project. Register candidates, resolve references, validate the complete candidate graph, then commit atomically. Never flush an incomplete graph.

**CI gate:** partial mount failure, unresolved references, candidate rollback, reload rollback, and no-publish-before-commit tests.

**Merge gate:** one graph, one publisher, one clock, one membership owner.

### PR-19: cross-motion and free-track capability

**Scope:** enable cross-motion edges and `adopt(track)` behind an explicit capability flag. Implement the locked policies: source unmount auto-removes dependent edges with structured diagnostics; sources are sampled at current progress; independent nodes sort by canonical qualified ID; missing nodes remain pending and cannot publish.

**CI gate:** cross-motion cycles, paused/seeked/reversed source timelines, source removal and re-add without silent reattachment, free-track participation, mount-order permutation, and diagnostic assertions.

**Merge gate:** capability is off by default until performance and compatibility evidence is accepted.

### PR-20: Engine and public API cleanup

**Scope:** extract assembly use cases, make reload failure-atomic, simplify Engine to lifecycle façade, update package exports, hide internals, and add an exports map blocking deep imports.

**CI gate:** consumer fixture, reload failure, duplicate IDs, foreign unmount, repeated destroy, package pack check, and import-boundary tests.

**Merge gate:** public API reflects ownership and old runtime is disposed only after replacement first-flush success.

### PR-21: measurement-gated optimization

**Scope:** only measured improvements: downstream indexes, heap-based topological ordering, tween collapse, or cache changes.

**CI gate:** benchmark comparison with p50/p95 flush time, compose count, retained objects, dropped frames, bundle size, and visual equivalence. No benchmark, no merge.

**Merge gate:** improvement is statistically meaningful at baseline and Spiral demo scale, with no correctness regression.

## CI pipeline

### Required checks on every PR

1. **Formatting:** Prettier check, no unrelated file churn.
2. **Unit tests:** `npm test` with coverage for changed packages.
3. **Type checks:** `npm run typecheck`.
4. **Build:** `npm run build`.
5. **Package boundary:** `npm run pack:check`, public consumer fixture, and forbidden-import scan.
6. **Determinism:** seeded graph/property tests run twice and compare serialized output.
7. **Lifecycle:** repeated mount/unmount/reload/destroy smoke test.

### Conditional checks

- Graph PRs: cycle, mutation rollback, topological-order, and graph/live-state equivalence suites.
- Publisher PRs: fake-clock, patch revision, retry/failure isolation, and subscriber scaling suites.
- Scheduler PRs: nested-GSAP spike, randomized layout, seek/reverse/reflow, and leak suites.
- Schema/plugin PRs: FK input cross-check and diagnostic snapshot suites.
- ProjectRuntime PRs: cross-motion, qualified-ID, staged-commit, and mount-order permutation suites.
- Performance PRs: benchmark and memory evidence uploaded as CI artifacts.

### CI jobs

```text
validate       format, unit, typecheck, build
boundaries     forbidden imports, exports map, consumer fixture, pack check
graph          graph correctness, cycles, rollback, deterministic order
runtime        fake clock, publisher, patch registry, failure isolation
scheduler      nested composition, reflow, disposal, GSAP spike
integration    Spiral, Walker, TowerDefense, React subscriptions
performance    benchmarks, memory churn, frame budget, artifact upload
```

`performance` may be non-blocking for PR-01 through PR-06, but becomes required and blocking from PR-07 onward. `project-runtime` checks remain disabled until PR-18 and are blocking for PR-18 onward.

## CI failure policy

- A flaky test blocks merge until quarantined with an owner and issue. Do not rerun blindly.
- A shadow mismatch blocks the PR unless classified as an approved intentional change with updated fixtures and migration notes.
- Any retained-object regression blocks lifecycle or runtime PRs.
- Any forbidden import blocks adapter-boundary PRs.
- Any nondeterministic order or patch revision blocks graph and publisher PRs.
- Benchmark regressions over the agreed budget block performance and project-runtime PRs.

## Release and rollback checkpoints

- **Checkpoint A, after PR-03:** lifecycle and graph mutations are safe; old rendering remains authoritative.
- **Checkpoint B, after PR-08:** actual Spiral path has passed shadow mode through the temporary compatibility composite.
- **Checkpoint C, after PR-11:** one composite remains and migration adapter is deleted.
- **Checkpoint D, after PR-16:** same-motion publisher path is production-capable; project graph still disabled.
- **Checkpoint E, after PR-18:** ProjectRuntime can mount and roll back atomically; cross-motion still disabled.
- **Checkpoint F, after PR-19:** cross-motion/free-track capability passes correctness and canary performance.

Rollback always disables the narrowest capability flag first. Keep the previous runtime alive until the replacement has mounted, validated, and completed its first successful flush. Preserve cycle protection and diagnostics during rollback.

## Definition of done for implementation

- Every architectural phase maps to a PR with one owner, tests, CI gates, and a rollback point.
- Phase 3 is explicitly split between fixture shadow validation and live Spiral shadow validation through `CompositeRuntime`.
- Manual-trigger Motion preserves `createGroupHost()` autoplay and control semantics.
- FK authored graph inputs are validated separately from standalone defaults.
- No partial graph is renderable or flushable.
- Cross-motion behavior is capability-gated and disabled by default until PR-19 evidence is accepted.
- The parent architecture plan and this execution plan agree on ownership, lifecycle, ordering, timeline, and validation policies.
