# MotionPath v5 implementation plan

**Status:** accepted execution plan  
**Revision:** 2026-08-07  
**Implementation base branch:** `v5`  
**Parent plan:** `docs/V5-ARCHITECTURE-REFACTOR-PLAN.md`  
**Review addendum:** `docs/V5-MIGRATION-REVIEW-ADDENDUM.md`

## Architecture review verdict

The implementation plan is sound after three corrections: the accepted architecture plan now incorporates the addendum; all implementation branches start from `v5`; and CI is bootstrapped before runtime changes. The critical sequencing rule is unchanged: fixture shadow validation precedes live Spiral shadow validation through temporary `CompositeRuntime`, which precedes manual-trigger Motion migration.

The plan is intentionally conservative. No project-wide graph, cross-motion edge, or free-track capability is enabled before the same-motion publisher, composite migration, plugin-input validation, and ProjectRuntime rollback gates pass.

## Delivery rules

- Every PR branches from `v5` or the immediately preceding v5 PR merge.
- One architectural concern per PR. No mixed structural and behavior migrations.
- Every behavior-changing PR has a flag, shadow mode, or a behavior-equivalence gate.
- Keep the old recursive composer and group-host path until the relevant shadow gate passes.
- Every PR includes success, failure, disposal, and repeated-execution tests where applicable.
- No partial graph is renderable or flushable.
- Never remove cycle protection during migration or rollback.
- Squash merge only, with no drive-by formatting or unrelated refactors.

## Branch and PR conventions

```text
v5                         # protected implementation base
v5/pr-00-ci
v5/pr-01-baseline
v5/pr-02-lifecycle
...
```

PRs should target `v5`, not `feat/graph-spiral-demo`. After each merge, rebase the next short-lived branch onto `v5`. Use titles such as `v5: make graph binding ownership explicit`.

## PR sequence

### PR-00: CI bootstrap and repository contracts

Add the GitHub Actions workflow, Node version pin, dependency-cache policy, concurrency cancellation, test/build/pack jobs, and artifact upload. Add scripts that actually exist before referencing them: format check, coverage if required, benchmark, boundary scan, and deterministic test mode. Do not pretend `npm run format` is a check, since the current script writes files.

**CI gate:** workflow runs on pull requests, `npm ci` is reproducible, and validate/boundaries jobs pass on the unmodified branch.

**Merge gate:** required checks are branch-protection-ready; benchmark and performance jobs are initially non-blocking.

### PR-01: baseline and observability

Add characterization fixtures for grandchild offsets, orphaned subtree removal, repeated Motion initialization, mount/unmount churn, failed mount, reload, paused/seeking/reversed timelines, and 10 subscribers over 60 frames. Record compose count, p50/p95 timing, dropped frames, retained objects, test count, build result, bundle size, and package contents.

**CI gate:** unit tests, typecheck, build, pack check, deterministic rerun, benchmark, and artifact upload. Known characterization failures must be explicitly tagged and expire by PR-03.

**Merge gate:** baseline report is committed under `docs/benchmarks/v5-baseline.json`; flags default to the old path.

### PR-02: lifecycle ownership repair

Attach graph ownership to its runtime owner, add idempotent disposal, fix failed-mount cleanup, and test reload/repeated destroy. Keep `GraphPublisher.removeTrack()` until its replacement destroy path is proven. Verify the live cycle guard remains installed.

**CI gate:** lifecycle, fake-timer churn, heap-retention smoke, and failure-injection mount tests.

**Merge gate:** no unreachable binding, no retained publisher/binding after destroy, and no cycle-protection regression.

### PR-03: graph transaction correctness

Defensively copy track maps; assert graph/track set equality in both directions; make `addTrack` atomic; route `removeChild` through graph invalidation; emit replacement additions; use one canonical sorter; and remove ignored retry configuration.

Test prepare/resolve/validate/wire/commit/invalidate rollback at every failing edge index. Preserve the old graph and live wiring exactly after failure.

**CI gate:** graph mutation/property tests, unknown source, duplicate ID, cycle, partial failure, publisher failure, deterministic order, and graph/live-state equivalence.

**Merge gate:** no successful or failed mutation can leave graph IR and live wiring divergent.

### PR-04: runtime scope boundary

Introduce `GraphRuntime` with `register`, `unregister`, `replaceEdges`, `flush`, and `dispose`. Start with one `MotionRuntime` per mounted Motion. Move binding/publisher ownership behind it, add deterministic `FakeClock`, patch registry, immutable revisions, statuses, and structured diagnostics.

**CI gate:** runtime contract tests, disposal/rollback tests, and core tests without React or GSAP.

**Merge gate:** runtime is addressable and disposable while old rendering remains authoritative.

### PR-05: patch and clock contracts

Define the immutable patch envelope and one-flush-per-clock-tick semantics. Include source progress and source revisions. Test coalescing, no half-flushed state, paused/seeking/reversed sources, and independent schedulers.

**Merge gate:** deterministic revisions and no duplicate flushes under bursty invalidation.

### PR-06: publisher path behind a flag

Wire publisher output to a patch registry and React subscription path, retaining the old path as default. Preserve the one-argument user `compose` callback and standalone local composition.

**CI gate:** old/new contracts, publisher failure isolation, retry behavior, subscriber lifecycle, and React integration.

**Merge gate:** enable/disable is runtime-safe and leak-free.

### PR-07: fixture shadow mode

Compute old and new patches for deterministic fixtures without switching rendering. Compare numeric values within a documented tolerance; compare structure, keys, roles, statuses, errors, and invalidation timing exactly.

**Merge gate:** zero unexplained mismatches across fan-in, fan-out, multi-level chains, rewiring, retry, failure isolation, and partial transactions.

### PR-08: compatibility composite runtime and live Spiral shadow

Add temporary `CompositeRuntime` around existing `TrackGroup`/`createGroupHost()`. It exposes the GraphRuntime surface but owns no graph semantics. Run the actual Spiral controller through it for spawn, pop, reflow, seek, reverse, destroy, and churn.

**Merge gate:** live old/new patches match within documented tolerance and no publisher, binding, track, or scheduler objects remain retained. Add a deletion check for the adapter before PR-11.

### PR-09: manual-trigger Motion compatibility

Add explicit `trigger.autoplay: boolean`, defaulting to current group-host behavior (`true`). Preserve seek, pause, reverse, remove, reflow, destroy, and repeated initialization.

**CI gate:** autoplay true/false, fake scheduler, Spiral integration, and deterministic state-vector or visual snapshot comparisons.

**Merge gate:** manual Motion matches the supported group-host contract.

### PR-10: collapse composites into Motion

Merge TrackGroup behavior into Motion, replace mirrored collections with one child collection and opaque slots, build the scheduler in the constructor, and remove `init()`. Keep the compatibility adapter only as a rollback bridge.

**CI gate:** depth 1/2/3/10 nesting, grandchild offsets, subtree removal, destroy-without-remove, all demo scenes, and public API compatibility.

**Merge gate:** only Motion schedules children; Track owns no topology or playback bridge.

### PR-11: delete migration composite and dead graph-order plumbing

After live shadow evidence is recorded, delete `CompositeRuntime`, TrackGroup, group-host bridge, `composeGraph`, `applyGraphOrder`, and stale graph-order fields. Update docs and add a repository symbol-ban test.

**Merge gate:** rollback now targets the last-known-good Motion path; no migration adapter remains.

### PR-12: ports and adapter isolation

Add Interpolator, Scheduler, and Clock ports. Move GSAP construction and ticker integration under `adapters/gsap/`. Core depends only on ports.

**CI gate:** GSAP-unavailable fake-backed core tests, forbidden-import scan, exports test, and no GSAP details in snapshots.

### PR-13: recursive scheduler proof and implementation

Complete the isolated depth-three GSAP spike, then allow Motion to contain Track or nested Motion. Test parent-relative offsets, reflow, seek, reverse, randomized layouts, and recursive disposal.

**Merge gate:** arbitrary-depth nesting is deterministic and no orphan scheduler child survives removal or destroy.

### PR-14: FK input and observation contract

Before extracting observation state, validate plugin-declared inputs against authored edges. In graph mode required inputs need exactly one compatible edge; standalone tracks may use documented defaults. For `fkPlugin`, `parentWorld` is required in graph mode and has an explicit identity-world standalone default.

Add stable diagnostics: `GRAPH_INPUT_MISSING`, `GRAPH_INPUT_UNKNOWN`, `GRAPH_INPUT_DUPLICATE`, `GRAPH_INPUT_ROLE_MISMATCH`.

**CI gate:** valid FK chain, missing input, wrong target, duplicate edge, role mismatch, standalone fallback, and qualified-source fixtures.

### PR-15: ObservationGraph extraction

Make ObservationGraph the only owner of edges, reverse indexes, cycle validation, and topological order. Move mutation semantics out of Track and keep standalone local composition explicit.

**CI gate:** graph model, cycle, rollback, compatibility-mode cycle protection, and no-Track-observation-state suites.

### PR-16: publish-only same-motion runtime

Make publisher output the only composition path for adopted same-motion nodes. React reads patches; standalone tracks retain direct local composition. Require compose-once-per-node-per-tick and subscriber-scaling evidence.

**Merge gate:** same-motion rendering is publisher-backed and compatibility output remains equivalent.

### PR-17: project membership and qualified IDs

Introduce typed registries, `motionId/trackId` qualified IDs, and `~/trackId` free-track IDs. Bare authored IDs remain motion-local. Cross-motion capability remains disabled.

**CI gate:** duplicate IDs, namespace collisions, stable order, remount equivalence, and public lookup.

### PR-18: ProjectRuntime and staged visibility

Replace motion-scoped ownership with one ProjectRuntime per loaded project. Register candidates, resolve references, validate the complete graph, then commit atomically. Never flush an incomplete graph.

**CI gate:** partial mount failure, unresolved references, candidate rollback, reload rollback, and no-publish-before-commit.

**Merge gate:** one graph, publisher, clock, and membership owner.

### PR-19: cross-motion and free-track capability

Enable cross-motion edges and `adopt(track)` behind an explicit capability flag. Apply accepted policies: source unmount auto-removes dependent edges with structured diagnostics; sources are sampled at current progress; independent nodes sort by canonical qualified ID; missing nodes remain pending and cannot publish; removed edges do not silently reattach.

**CI gate:** cross-motion cycles, paused/seeked/reversed sources, source removal/re-add, free tracks, mount-order permutations, diagnostics, and canary performance.

**Merge gate:** capability stays off by default until evidence is accepted.

### PR-20: Engine and public API cleanup

Extract assembly use cases, make reload failure-atomic, simplify Engine to a lifecycle façade, update exports, hide internals, and add an exports map blocking deep imports.

**CI gate:** consumer fixture, reload failure, duplicate IDs, foreign unmount, repeated destroy, pack check, and import boundaries.

### PR-21: measurement-gated optimization

Only merge measured improvements: downstream indexes, heap-based ordering, tween collapse, or cache changes.

**CI gate:** baseline versus demo p50/p95 flush time, compose count, retained objects, dropped frames, bundle size, and visual equivalence. No benchmark, no merge.

## CI design

### Required checks on every PR

- `npm ci` with the pinned Node version.
- Format check using a non-mutating command.
- `npm test` plus changed-package coverage once the coverage script exists.
- `npm run typecheck`.
- `npm run build`.
- `npm run pack:check`.
- Public consumer fixture and forbidden-import scan.
- Seeded deterministic tests run twice and serialized outputs compared.
- Lifecycle smoke test for mount/unmount/reload/destroy.

### Jobs

```text
validate       install, format, unit, typecheck, build
boundaries     forbidden imports, exports map, consumer fixture, pack check
graph          cycles, mutation rollback, deterministic order, graph/live equivalence
runtime        fake clock, publisher, patch registry, failure isolation
scheduler      nested composition, reflow, disposal, GSAP spike
integration    Spiral, Walker, TowerDefense, React subscriptions
performance    benchmarks, memory churn, frame budget, artifact upload
```

`performance` is non-blocking through PR-07, required from PR-08, and blocking from PR-19. ProjectRuntime checks are enabled as non-blocking contract checks in PR-17, blocking from PR-18. Do not hide missing scripts behind CI conditionals: PR-00 must add every invoked command.

### Failure policy

Flaky tests block merge until quarantined with an owner and issue. Shadow mismatches block unless explicitly classified as an intentional contract change with updated fixtures. Retained-object regressions, forbidden imports, nondeterministic order/revisions, and benchmark regressions over the agreed budget block their applicable PRs.

## Checkpoints and rollback

- **A, PR-03:** lifecycle and graph mutations safe; old rendering authoritative.
- **B, PR-08:** actual Spiral path passes compatibility-composite shadow mode.
- **C, PR-11:** one permanent composite remains; migration adapter deleted.
- **D, PR-16:** same-motion publisher production-capable; project graph disabled.
- **E, PR-18:** ProjectRuntime mounts and rolls back atomically; cross-motion disabled.
- **F, PR-19:** cross-motion/free-track capability passes correctness and canary performance.

Rollback disables the narrowest flag first. Keep the prior runtime alive until the replacement mounts, validates, and completes its first successful flush. Preserve cycle protection and diagnostics.

## Implementation definition of done

- Every phase maps to a PR with tests, CI gates, rollback guidance, and evidence.
- All implementation PRs target the `v5` base branch.
- Phase 3 is explicitly fixture shadow plus live Spiral shadow through temporary CompositeRuntime.
- Manual-trigger Motion preserves group-host autoplay/control semantics.
- FK authored inputs are validated separately from standalone defaults.
- No partial graph is renderable or flushable.
- Cross-motion behavior is capability-gated and disabled by default until PR-19 evidence is accepted.
- Parent architecture and implementation plans agree on ownership, lifecycle, ordering, timeline, validation, and branch policy.
