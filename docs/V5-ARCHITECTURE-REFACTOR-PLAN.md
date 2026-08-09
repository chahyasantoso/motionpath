# MotionPath v5 architecture refactor plan

**Status:** accepted for implementation  
**Revision:** 2026-08-07, phase-to-PR traceability added  
**Restored:** 2026-08-09, full plan recovered from `7d007a0` after `7da4419` replaced it with a reconciliation stub. See Appendix A.  
**Implementation base branch:** `v5`  
**Original design branch:** `feat/graph-spiral-demo`  
**Scope:** runtime architecture refactor, including the observation graph foundation. This is not a graph feature plan.

## Executive decision

The target architecture is approved, with a staged strangler migration. We will not introduce a project-wide graph, recursive Motion composition, and a new publisher path in the same step.

The implementation order is:

1. Characterize behavior and repair lifecycle seams.
2. Introduce explicit runtime ownership, ports, clock, and patch contracts without changing the default renderer.
3. Migrate same-motion graphs to one publisher path behind a compatibility boundary, first with deterministic fixtures and then through the real Spiral group-host path.
4. Replace the temporary group-host compatibility path with manual-trigger `Motion`, preserving autoplay and controls.
5. Collapse the composite implementations into `Motion` and prove recursive scheduling.
6. Validate plugin inputs against observation edges, then move graph ownership out of `Track`.
7. Promote the runtime from motion scope to project scope.
8. Enable cross-motion edges and free tracks only after correctness, rollback, and performance gates pass.

The graph layer is not harmless dead code. Its cycle guard is live today, while its publisher and binding are unreachable, retained through track callbacks, and never flushed. No migration or rollback may remove cycle protection.

The target end state is:

```text
Project schema
  -> validate + normalize
  -> compile tracks into interpolators
  -> assemble recursive Motions
  -> one project ObservationGraph
  -> one topological Publisher flush per clock tick
  -> renderer-neutral patches
  -> React / DOM / Canvas / Flutter adapters
```

## Non-negotiable design rules

1. `Track` is a leaf. It samples and composes only its own plugin output.
2. `Motion` is the sole permanent composite. It schedules `Track` or nested `Motion` children recursively.
3. Topology is a tree. Observation is a DAG. Never merge those models.
4. GSAP is an adapter behind `Interpolator`, `Scheduler`, and `Clock` ports.
5. There is one graph owner per runtime scope. Migration starts motion-scoped and ends project-scoped.
6. Subscribers consume published immutable patches; they do not recursively compose the graph.
7. Mutations are atomic, ownership is explicit, and every runtime object has one idempotent disposer.
8. Compatibility behavior lives at migration boundaries, not in `Track` or `Motion` forever.
9. Every semantic migration has a kill switch and measured exit gate.
10. No partial graph is renderable or flushable.

## Accepted architecture decisions

### AD-1: staged graph scope

The final scope is one graph per loaded project. The first publisher migration uses one `MotionRuntime` per mounted Motion behind a scope-aware `GraphRuntime` interface. The final implementation uses `ProjectRuntime` for all mounted motions and adopted/free tracks.

Cross-motion edges and free tracks remain disabled until the project scope passes clock, unmount, rollback, and performance gates.

### AD-2: immutable patch contract

The publisher emits a renderer-neutral patch envelope:

```js
{
  nodeId,
  revision,
  values,
  sourceProgress,
  sourceRevisions,
  status: "ready" | "blocked" | "error"
}
```

Patches are immutable. A revision changes only when effective output changes. Subscribers never observe half a flush.

### AD-3: explicit clock ownership

A publisher flush runs once per runtime clock tick, never opportunistically from an individual track callback. The clock defines ordering only. It does not synchronize independent Motion timelines.

During a shared flush, each source is sampled at its current progress, including paused, seeking, reversed, and independently mounted states. Source progress and revision are observable in patch metadata and diagnostics.

### AD-4: transaction boundaries

Graph mutation, mount, unmount, reload, and flush each have explicit transaction boundaries:

```text
prepare -> resolve -> validate -> wire -> commit -> publish invalidation
```

A failed operation leaves the previous committed runtime usable. Shared membership maps and live edges are never mutated while later inputs are still being resolved.

### AD-5: public API follows ownership

Do not expose `GraphPublisher`, `GraphBinding`, `SchedulerSlot`, raw GSAP objects, or graph internals from the package root. Expose `Engine`, `Motion`, `Track`, public contracts, runtime handles, and supported adapters only.

### AD-6: source-unmount semantics

When a source Motion or track is unmounted, dependent edges are auto-removed, a structured diagnostic is emitted, and downstream nodes are invalidated. The dependent is not failed globally, and the source is never replaced with `null`.

Re-adding the source does not silently recreate the edge. Authored or runtime configuration must explicitly restore it.

### AD-7: independent timeline semantics

If Motion A observes Motion B, A samples B at B's current progress. A must not advance, rewind, pause, or otherwise control B during composition. Deterministic fake clocks and independent fake schedulers test this before cross-motion enablement.

### AD-8: canonical ordering

Independent nodes are ordered by canonical qualified ID, never declaration or mount order. Mounted nodes use `motionId/trackId`; adopted/free tracks use a reserved namespace such as `~/trackId`. The same project state produces the same order after reload, remount, or mutation-history changes.

### AD-9: staged validation and atomic visibility

Registration may be staged internally, but only a complete candidate graph can be committed to the renderable runtime. Candidate validation resolves qualified references, duplicate IDs, unknown sources, edge roles, plugin inputs, and cycles before commit.

Unresolved references remain pending with structured diagnostics and cannot publish. They are not treated as `null`. Once required nodes are present, the candidate is revalidated and committed atomically.

### AD-10: compatibility-composite shadowing

Until `Motion` replaces `createGroupHost()`, the existing group-host path participates through a temporary `CompositeRuntime` adapter. It owns no new graph semantics and must be deleted after the Motion migration. Phase 3 has two separate gates: fixture-only publisher validation, then live Spiral shadow validation through this adapter.

### AD-11: authored graph inputs versus standalone defaults

A track's graph mode is explicit, never inferred from whether an observation edge happens to be present. Runtime construction assigns one of two states:

- **`standalone`**: intentionally created outside a graph runtime, such as a direct `createTrackInstance()` that has not been adopted. Plugin `standaloneDefault` values may apply.
- **`authored-graph`**: created from a project/motion schema or registered with a `GraphRuntime`, even if registration is staged or incomplete. Required plugin inputs must be validated and missing edges fail with diagnostics; standalone defaults must not mask the error.

The graph-mode state is carried by the runtime/track contract and is not derived from `observes.length`, publisher attachment, or current membership. Registration may produce a pending authored-graph node, but it never downgrades that node to standalone.

For `fkPlugin`, `parentWorld` is required in authored graph mode but may use an identity-world standalone default. Stable diagnostics include `GRAPH_INPUT_MISSING`, `GRAPH_INPUT_UNKNOWN`, `GRAPH_INPUT_DUPLICATE`, and `GRAPH_INPUT_ROLE_MISMATCH`.

## Target ownership

```text
Engine
  owns project lifecycle, instance ownership, dependencies
  owns one ProjectRuntime

ProjectRuntime
  owns one ObservationGraph, GraphPublisher, Clock
  owns graph membership and qualified node ids
  owns mounted Motion and adopted/free Track registration

Motion
  owns one Scheduler and child slots
  owns trigger controls and layout policy
  can contain Track or Motion

Track
  owns one Interpolator and plugin composer
  has no children, host, observation edges, or playback bridge

ObservationGraph
  owns qualified node ids, edges, validation, cycle checks, topological order

GraphPublisher
  owns dirty state, composed-patch cache, downstream invalidation, retry policy
  publishes once per dirty node per flush

Adapters
  own GSAP, DOM, React, clocks, and browser capability checks
```

## Phase-to-PR traceability

| Architecture phase | Implementation PRs | Primary gate |
|---|---:|---|
| Phase 0: characterization and guardrails | PR-00 to PR-01 | CI green, baseline captured, old path unchanged |
| Phase 1: lifecycle and graph transaction repair | PR-02 to PR-03 | no leaks or graph/live-state divergence; cycle guard intact |
| Phase 2: runtime scope and compatibility boundary | PR-04 to PR-05 | addressable runtime, deterministic clock and patch contract |
| Phase 3: publisher migration and shadow validation | PR-06 to PR-08 | fixture equivalence, then live Spiral equivalence |
| Phase 4: manual-trigger Motion compatibility | PR-09 | autoplay and control parity |
| Phase 5: composite collapse and recursive scheduling | PR-10 to PR-13 | one composite, arbitrary-depth nesting, recursive disposal |
| Phase 6: ports and adapter isolation | PR-12 to PR-13 | no forbidden GSAP imports, fake-backed core |
| Phase 7: FK input contract and ObservationGraph extraction | PR-14 to PR-15 | explicit mode validation, Track is a leaf |
| Phase 8: publish-only same-motion runtime | PR-16 | compose once per node per tick |
| Phase 9: project membership and ProjectRuntime | PR-17 to PR-18 | atomic staged commit, one runtime owner |
| Phase 10: cross-motion/free-track capability | PR-19 | policy, determinism, canary performance |
| Phase 11: Engine/API cleanup and measured optimization | PR-20 to PR-21 | public boundary and measured wins only |

**Ordering note:** PR-12 and PR-13 are grouped under both Phase 5 and Phase 6 because adapter isolation is required to prove recursive scheduling cleanly; PR-13 is the hard recursion gate, not a duplicate implementation phase.

## Phased execution plan

Each phase maps to the PR sequence in `docs/V5-IMPLEMENTATION-PLAN.md`. The base branch for all implementation PRs is `v5`. Every phase starts with tests and ends with an exit gate. No phase may silently change the default migration flag.

### Phase 0: characterization and guardrails

Add regression tests for grandchild offsets, orphaned subtree removal, repeated Motion initialization, mount/unmount churn, failed mount, reload, and independent timeline states. Add compose-count, frame, heap-retention, bundle, and package baselines. Add deterministic feature flags and a GSAP import-boundary test.

**Exit:** baseline artifacts committed; default behavior unchanged.

### Phase 1: lifecycle and graph transaction repair

Attach graph ownership to its runtime owner, add idempotent disposal, fix failed-mount cleanup, defensively copy track maps, assert graph/track set equality in both directions, make `addTrack` atomic, route `removeChild` through graph invalidation, emit replacement additions, use one sorter, and remove ignored retry configuration. Keep `GraphPublisher.removeTrack()` until destroy ownership is rewritten and tested.

**Exit:** no unreachable binding, shared mutable ownership, graph/live-state divergence, or cycle-protection regression.

### Phase 2: runtime scope and compatibility boundary

Introduce `GraphRuntime` with `register`, `unregister`, `replaceEdges`, `flush`, and `dispose`. Start with `MotionRuntime`, add deterministic fake Clock, patch registry, status/revision semantics, structured diagnostics, and a kill switch retaining the recursive composer.

**Exit:** runtime is addressable and disposable while the old composer remains authoritative.

### Phase 3: publisher migration and shadow validation

Run one flush per injected Clock tick and wire the publisher to a patch registry. Preserve standalone local composition and the one-argument user `compose` callback. First run fixture-only shadow comparisons. Then add temporary `CompositeRuntime` around `TrackGroup`/`createGroupHost()` and shadow-test the real Spiral path for spawn, pop, reflow, seek, reverse, destroy, and churn.

The old recursive composer remains the rendering authority until both gates pass. `CompositeRuntime` is migration-only and must be deleted after the Motion migration.

**Exit:** zero unexplained fixture mismatches, then live Spiral equivalence within documented numeric tolerance and no retained runtime objects.

### Phase 4: manual-trigger Motion compatibility

Replace `createGroupHost({ id, staggerTransition, autoplay })` with manual-trigger Motion using explicit `trigger.autoplay`, defaulting to the existing behavior of `true`. Test autoplay, seek, pause, reverse, remove, reflow, destroy, and repeated initialization. Only after this gate delete `CompositeRuntime`.

**Exit:** manual Motion is behavior-equivalent to the supported group-host surface.

### Phase 5: collapse composites and prove recursive scheduling

Merge `TrackGroup` into Motion, remove mirrored collections and `init()`, make child offsets parent-relative, and run the isolated depth-three GSAP spike before enabling nested Motion children. Verify arbitrary-depth scheduling, reflow, seeking, reversing, subtree removal, and recursive disposal.

**Exit:** only Motion schedules children; no Track owns topology or playback.

### Phase 6: ports and adapter isolation

Add `Interpolator`, `Scheduler`, and `Clock` ports. Move GSAP construction and ticker integration into adapters. Run core tests without loading GSAP.

**Exit:** no forbidden GSAP imports and fake-backed core tests pass.

### Phase 7: FK input contract and ObservationGraph extraction

First enforce plugin-input/observation cross-checks and explicit standalone defaults. The validator receives the track's explicit mode: `standalone` skips authored-edge requirements and may use documented defaults; `authored-graph` requires every required plugin input to have exactly one compatible edge, even when the node is pending registration. Then make `ObservationGraph` the sole owner of edges, reverse indexes, cycle validation, and topological order. Remove Track observation state only after all enabled paths have equivalent cycle protection.

**Exit:** malformed authored FK rigs fail validation, standalone defaults remain supported, and Track is a leaf.

### Phase 8: publish-only same-motion runtime

Make publisher output the only composition path for adopted same-motion nodes. React reads patches; standalone tracks retain direct local composition. Require compose-once-per-node-per-tick and subscriber-scaling evidence.

**Exit:** same-motion rendering is publisher-backed and compatibility output remains equivalent.

### Phase 9: project membership and ProjectRuntime

Add typed registries and qualified IDs, then replace motion-scoped ownership with one ProjectRuntime per loaded project. Stage candidate registration, resolve references, validate completely, and commit atomically. Keep cross-motion capability disabled during this phase.

**Exit:** one graph, publisher, clock, and membership owner; no incomplete graph flushes.

### Phase 10: cross-motion/free-track capability

Enable cross-motion edges and `adopt(track)` behind an explicit capability flag. Apply the accepted unmount, timeline, ordering, reattachment, diagnostics, and pending-reference policies. Keep it off by default until canary performance and compatibility evidence pass.

**Exit:** project-scope correctness and mount-order determinism are proven.

### Phase 11: Engine/API cleanup and measured optimization

Extract assembly use cases, make reload failure-atomic, simplify Engine, update exports, hide internals, add an exports map, and only then consider measured optimizations such as downstream indexes, heap ordering, or tween collapse.

**Exit:** public API reflects ownership; every optimization has benchmark and visual evidence.

## Definition of done

- Plan is accepted and implementation starts from branch `v5`.
- `Track` is a leaf; `Motion` is the sole permanent composite with arbitrary-depth nesting.
- Grandchild offsets and recursive teardown are tested.
- One runtime owner controls graph membership and one deterministic topological order.
- Graph mutations, mount, unmount, reload, and flush are atomic at their boundaries.
- No GSAP imports exist outside adapters; fake-backed core tests pass.
- Publisher composition occurs once per dirty node per tick and serves all subscribers.
- React does not recursively compose graph sources when publisher mode is enabled.
- Temporary `CompositeRuntime` is deleted after live Spiral shadow validation and manual Motion migration.
- Authored FK inputs are validated separately from standalone defaults using explicit track mode, never inferred from missing edges.
- Cross-motion/free-track behavior is capability-gated and disabled by default until accepted evidence exists.
- Every phase has tests, CI gates, rollback guidance, and measured evidence where behavior or performance changes.

## Rollback

Disable the narrowest capability first. Keep the compatibility composer until shadow mode proves equivalence. Keep the old runtime alive until its replacement has mounted, validated, and completed a first successful flush. Never remove cycle protection or diagnostics during rollback.

## Appendix A: current-state reconciliation, 2026-08-08

On 2026-08-08, commit `7da4419` replaced this entire plan (274 lines) with the 15-line note below. The note is accurate and is retained here; it was never intended to be a substitute for the plan, and the plan above is restored as the primary document.

> The target architecture and ownership rules remain accepted. The accepted implementation sequence ends at PR-21. PR-22 and PR-23 are supplemental follow-ups, not new architecture checkpoints.
>
> **Current deviations requiring attention:**
>
> - `ObservationGraph` now owns normalized metadata, adjacency indexes, and collision-proof edge identity, but live mutation still remains behind `GraphBinding` and standalone `Track` behavior. Do not claim full Track extraction yet.
> - The graph objects freeze containers and direct records; deep immutability of nested user-owned values still needs an explicit contract and tests.
> - The architecture requires no GSAP imports outside adapters. Current repository searches still find direct imports in core-adjacent runtime/test paths, so the import-boundary result needs an explicit audit rather than a broad "done" claim.
> - Conservative defaults remain mandatory: `crossMotion`, `freeTracks`, and `publisherRendering` stay disabled by default.
>
> **Evidence policy:** use `V5-STATUS.md` for current implementation status and `V5-REVIEW-FINDINGS-LOG.md` for findings. Historical reviews do not override those documents. Any remaining extraction or contract-hardening work requires a named plan revision before it becomes a new checkpoint.

**Note:** the conservative-defaults line above is contradicted by `docs/V5-BREAKING-CHANGE-FEASIBILITY.md`, which recommends burning those flags on and deleting them. If that report is accepted, this appendix and the phase plan above need a named revision.

## Related documents

- `docs/V5-IMPLEMENTATION-PLAN.md`: PR sequence, CI jobs, merge gates, and checkpoints.
- `docs/V5-MIGRATION-REVIEW-ADDENDUM.md`: source review and accepted migration corrections.
- `docs/V5-BREAKING-CHANGE-FEASIBILITY.md`: feasibility of dropping compatibility entirely.
- `docs/GRAPH-OBSERVATION-AUDIT-2026-08-05.md`: verified graph findings.
- `docs/ARCHITECTURE.md`: package ownership baseline.
