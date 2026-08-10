# MotionPath v5: From-Scratch Reference System Design

> Reference architecture for a new repository inspired by `motionpath`, but intentionally disconnected from it. This document preserves the architectural spirit while removing migration baggage, compatibility seams, and historical assumptions.
>
> Reviewed source: `feat/pass2-track-facade-removal` at the current branch head, including the V5 hard-break plan, core, React adapter, demo app, scripts, performance suite, package manifests, and CI configuration. The authored JSON contract remains `schemaVersion: 4` for the reference design.

## 1. Executive recommendation

Build a small, package-oriented animation runtime around one invariant: **a loaded project has exactly one authoritative observation graph, one live observation state, one mutation coordinator, one publisher, one patch registry, and one clock subscription**.

The new repository should not be a cleaned copy of the existing repository. Start with a deliberately smaller kernel and reintroduce features only after their ownership is explicit. The existing code has strong ideas, but it also contains migration residue: two observation ownership modes that resolve to the same implementation, a publisher that still mutates topology, a bridge that recreates live state after commits, per-Motion runtime construction, recursive graph composition through Track, rollout flags, and Track-owned composite behavior. Copying that shape would copy the problem.

The target model is:

```text
Adapters: GSAP, DOM, React, browser clock
                 |
              Ports
                 |
Engine -> ProjectRuntime -> GraphRuntime
                              |
                GraphBinding -> ObservationState
                              |
                         GraphPublisher
                              |
                         PatchRegistry

Motion owns topology, scheduling, triggers, playback, and children.
Track owns playhead state, interpolation, and local plugin composition.
```

The system is a **transactional dataflow runtime**, not a collection of Tracks that happen to observe one another.

## 2. What the current codebase actually is

### Repository shape

The source tree is a Vite application repository with two packages rather than a clean package workspace:

- `packages/core`: domain objects, runtime, graph use cases, ports, adapters, validators, types, and tests.
- `packages/react`: React hooks for project loading, motion instances, timeline playback, graph patch subscription, and smooth scroll.
- `apps/demo`: React/Vite demos and visual evidence, including the graph/spiral work.
- `docs`: architecture, schema, graph, V4 history, V5 plans, audits, implementation reviews, handoffs, and status files.
- `scripts`: physical reorganization and boundary scans, including GSAP and pass-2 rules.
- `performance`: rig graph, downstream index, and V5 baseline benchmarks with budgets.
- `.github/workflows`: CI matrix plus an automatic format-fix workflow.

The root package is private, ESM, and currently owns the scripts. Runtime dependencies include GSAP, Lenis, React, and React Router. Tests use Vitest and JSDOM; formatting uses Prettier; the CI target is Node 24.

### Existing architectural strengths

1. The authored schema is treated as a stable contract instead of being casually redesigned during runtime refactors.
2. Graph normalization produces nodes, edges, validation errors, and topological order before execution.
3. `ObservationState`, `GraphBinding`, `GraphPublisher`, `GraphRuntime`, `PatchRegistry`, and `ProjectRuntime` are the right conceptual decomposition.
4. Immutable patch publication, downstream invalidation, retry state, fake clocks, injected interpolators/schedulers, boundary tests, and deterministic benchmarks are all good foundations.
5. Lifecycle events and owner-first cleanup are recognized as first-class concerns.
6. React already has a graph patch subscription path, which is the correct direction for renderer consumption.

### Current drift to avoid

The reviewed branch still has these architectural conflicts:

- `createTrack()` unconditionally installs `LegacyObservationFacade`, so the production Track surface still carries the old observation API.
- `StandaloneObservationAdapter` is an alias of `ScopedObservationAdapter`; the ownership flag and parity suite create complexity without two real behaviors.
- `GraphPublisher` exposes `addTrack`, `removeTrack`, `addEdge`, and `removeEdge`, overlapping with `GraphBinding`.
- `GraphBinding` rebuilds `ObservationStateBridge` after a commit, replacing live state instead of mutating one stable owner.
- `Engine.#mountMotion()` constructs graph runtime pieces per Motion; `ProjectRuntime.attachGraphRuntime()` is not the authoritative mount path.
- `GraphPublisher.flush()` composes via `track.compose()`, allowing graph recursion to remain in the Track path.
- `Track` still owns child topology, group-host bridging, and playback seams while `Motion` also owns scheduling.
- `Engine` and `ProjectRuntime` retain rollout flags such as `publisherRendering`, `crossMotion`, and `freeTracks`.
- Readability tests protect comments and a non-shrinking file allowlist, which makes planned deletion fail for reasons unrelated to behavior.
- The existing CI is useful but runs many independent jobs with repeated install work and lacks a single explicit integration/e2e evidence job.

These are not reasons to abandon the design. They are reasons to restart with one authority per responsibility.

## 3. Design principles

### One authority per state transition

All topology changes go through `ProjectRuntime.mutate()` or a narrow equivalent. The mutation pipeline is:

```text
command
  -> candidate graph
  -> normalize and validate
  -> apply ObservationState changes with undo journal
  -> apply publisher schedule
  -> commit immutable graph snapshot
  -> invalidate affected nodes
```

A failed mutation must leave graph IR, live edges, publisher indexes, lifecycle subscriptions, Track ownership, and published patches exactly as they were.

### Stable identity, qualified internally

Authored IDs can stay local to a Motion for compatibility. Runtime IDs are always qualified:

- `motionId/trackId` for authored Motion tracks
- `~/trackId` for adopted free Tracks

Normalize once at project load. Reject ambiguous, duplicate, malformed, unknown, self-referential, and cyclic references before any Motion is mounted. Use canonical qualified IDs for deterministic ordering.

### Leaves do not own composites

A Track is a leaf. It owns only:

- playhead/progress state;
- interpolation inputs;
- resolved local plugin composition;
- local lifecycle and renderer-neutral snapshots.

Motion owns:

- child membership and hierarchy;
- stagger/layout/reflow;
- timeline construction and playback;
- trigger delegates;
- child teardown.

GraphRuntime owns dependency traversal and publication. No Track method recursively walks graph dependencies.

### Ports isolate time and rendering technology

Core accepts ports, not GSAP or browser globals:

```ts
interface Clock {
  subscribe(listener: (event: { tick: number; time: number }) => void): () => void;
}
interface Interpolator {
  create(config: unknown): InterpolationTimeline;
}
interface Scheduler {
  schedule(job: () => void, options?: unknown): Cancel;
}
```

GSAP, DOM, React, Lenis, and browser timing live in adapters. Core tests use fake ports and never import GSAP.

### Immutable publication

A flush creates one immutable batch. The batch contains revisioned patches, source progress, dependency revisions, and diagnostics. Subscribers consume batches or node patches; they do not inspect Track internals. A subscriber must never observe half of a graph flush.

### Owner-first, idempotent lifecycle

The owner removes graph membership, subscriptions, and edges first. The contained object then releases local resources. Every `destroy()` and `dispose()` is idempotent. Borrowed runtimes are detached, not destroyed by a caller that does not own them.

## 4. From-scratch repository layout

```text
motionpath-v5-reference/
  package.json
  package-lock.json
  tsconfig.json
  .github/workflows/ci.yml
  docs/
    architecture.md
    authored-schema-v4.md
    breaking-api.md
  packages/
    core/
      src/
        contract/
        domain/          # Motion, Track, plugins, value types
        graph/            # graph IR, normalization, validation, state
        runtime/         # ProjectRuntime, GraphRuntime, PatchRegistry
        ports/           # Clock, Interpolator, Scheduler
        adapters/        # GSAP and browser integrations
        errors/
        index.ts
      test/
        unit/
        integration/
        fixtures/
    react/
      src/               # patch and lifecycle hooks only
  apps/
    demo/
  performance/
    budgets.json
    graph-benchmark.mjs
  scripts/
    boundary-scan.mjs
    api-surface-check.mjs
```

Prefer TypeScript for new public contracts and runtime boundaries. Keep implementation language consistent within a package. Do not recreate the current repository's mixed JS/TS type declaration seam unless there is a strong reason.

## 5. Runtime model

### ProjectRuntime

Owns project lifetime, loaded normalized project, membership, instance registry, diagnostics, and exactly one GraphRuntime. It exposes commands such as:

```ts
load(project): Promise<void>
mountMotion(id): Motion
adopt(track): QualifiedTrack
addEdge(edge): void
removeEdge(edge): void
replaceEdge(oldEdge, nextEdge): void
flush(): FlushResult
subscribe(nodeId, listener): Unsubscribe
dispose(): void
```

`ProjectRuntime` is either owned by `Engine` or injected as borrowed. The ownership policy is explicit and never changes during `destroy()`.

### GraphRuntime

Owns one `GraphBinding`, one `ObservationState`, one `GraphPublisher`, one `PatchRegistry`, and one clock subscription. It is project-wide, not Motion-wide.

`GraphBinding` is the only topology mutation coordinator. `GraphPublisher` accepts only a fully validated graph snapshot and publishes it; it cannot add or remove graph entities. `ObservationState` is long-lived and mutated in place with an undo journal.

### Flush algorithm

1. Clock tick or explicit flush starts one patch batch.
2. Dirty seeds come from playhead invalidation and graph mutations.
3. Traverse canonical topological order.
4. Compose each dirty node at most once.
5. Block downstream nodes when an upstream composition fails.
6. Publish immutable patches in the same batch.
7. Retain retry metadata only for failed publication, not for successful state.
8. Close the batch and notify subscribers.

The initial proof should show `Motion A -> Motion B` composing in one tick, one batch, one publication per changed node, and stable invalidation after A unmounts.

## 6. Public API to design, and what not to carry forward

Keep:

- `Engine` as the user-facing entry point;
- project loading and `schemaVersion: 4` authored input;
- `Motion`, `Track`, plugin registration, triggers, and patch subscriptions;
- fake/manual Clock support;
- explicit dependency injection for ports;
- stable validation diagnostics;
- `engine.createMotion(...)` for programmatic composition;
- `engine.adopt(track)` for free-track membership once qualified IDs work.

Delete from the new design:

- `LegacyObservationFacade` and all Track observation aliases;
- `observationOwnership`, `OBSERVATION_OWNERSHIP_MODES`, resolver, adapter alias, and parity mode;
- `publisherRendering` and publisher-off rendering branches;
- `crossMotion` and `freeTracks` capability flags;
- `ObservationStateBridge` and post-commit state recreation;
- `Motion.composeGraph()` and `Motion.applyGraphOrder()`;
- `createMotionHost()` compatibility API;
- Track child topology, parent/children ownership, group-host bridging, and composite playback;
- source-text-only symbol scans and prose/comment ratio gates.

## 7. Recommended workflow

Start with a new repository and a clean `main` or `v5` branch. Keep the old repository as a read-only reference. Do not copy its commit history, migration branches, or status documents.

Work in vertical slices, each proving a user-visible capability. Keep behavior changes separate from formatting. Keep each PR below roughly 20 semantic files; if a phase exceeds 25 commits or receives a second revert, stop and re-cut it.

Every change should follow this loop:

1. Write or update the invariant and a failing test.
2. Implement the smallest ownership-preserving change.
3. Migrate tests, types, exports, docs, and demos in the same change.
4. Run the full local matrix, not only the nearest unit test.
5. Review a whitespace-insensitive diff and public API diff.
6. Merge only when the branch is green and the phase exit gate is met.

Use contract tests across ports and adapters. Use integration fixtures for graph order, rollback, lifecycle, and patch batching. Treat benchmark output as a regression signal, not a decorative report.

## 8. Delivery phases

### Phase 0: repository and evidence baseline

Create the new package layout, Node 24 toolchain, formatter, test runner, typed public contracts, fake ports, and a minimal CI matrix. Capture golden fixtures for local composition, graph edges, rollback, cycles, diamond memoization, lifecycle cleanup, paused/seeking/reversed playback, and patch immutability.

**Exit:** core runs without GSAP, contracts are typed, all gates are honest, and the compatibility fixtures are reproducible.

### Phase 1: leaf domain and local composition

Implement immutable value snapshots, plugin registry, Interpolator port, Track playhead, local composition, and lifecycle events. Implement Motion scheduling with a fake Scheduler and fake timeline. Do not add observation graph behavior yet.

**Exit:** Track is a renderer-neutral leaf; Motion owns children and playback; unit tests cover teardown and reinitialization.

### Phase 2: graph kernel

Implement qualified IDs, graph IR, normalization, role validation, duplicate/unknown/self-reference checks, cycle detection, canonical topological ordering, and ObservationState. Add transactional GraphBinding with undo journal.

**Exit:** invalid graphs fail before mount; mutations are atomic; state identity remains stable across commits.

### Phase 3: project-wide runtime and publication

Implement ProjectRuntime, one GraphRuntime, GraphPublisher as a publication-only component, PatchRegistry, dirty propagation, batching, retries, and one injected Clock subscription. Mount two Motions into one graph.

**Exit:** one project-wide flush produces one immutable batch; no per-Motion publisher or clock exists.

### Phase 4: adapter and renderer integration

Add GSAP and browser adapters behind ports. Add React hooks that subscribe to PatchRegistry batches and do not call recursive Track composition. Add DOM/React integration fixtures and demo evidence.

**Exit:** core test suite runs without GSAP; React consumes immutable published patches; boundary scans pass.

### Phase 5: cross-motion and free-track membership

Enable `motionId/trackId` references and `~/trackId` adopted tracks without flags. Define diagnostics for missing, unknown, duplicate, role-mismatched, and incompatible inputs. Prove unmount behavior and downstream diagnostics.

**Exit:** cross-motion and adopted tracks work through the same graph, state, publisher, patch, clock, and lifecycle system.

### Phase 6: release hardening

Finalize exports, TypeScript declarations, package export maps, docs, examples, API breaking-change table, benchmarks, migration guidance for authored projects, and deterministic thresholds. Delete all migration-only code and tests.

**Exit:** public docs describe only the new runtime; full CI is green; package dry run succeeds; performance budgets are explicit.

## 9. CI workflow

Use one authoritative workflow for pull requests and protected branches. Avoid a second workflow that silently mutates contributor branches; formatting should fail with an actionable command instead.

Recommended jobs:

- `quality`: install once, run format check, lint, typecheck, unit tests, and public API surface checks.
- `integration`: run graph transaction, lifecycle, adapter contract, React, and demo smoke tests.
- `build`: build core, React, and demo; run package export/import smoke tests.
- `boundaries`: verify no GSAP imports in core domain/graph/runtime, no legacy symbols, no duplicate runtime owners, and no forbidden public exports.
- `performance`: run deterministic graph and downstream benchmarks; compare against `performance/budgets.json` and fail only on a defined threshold.
- `package`: run `npm pack --dry-run`, install the tarball in a temporary consumer, and import the documented public API.

Workflow rules:

- Node 24, pinned lockfile, `npm ci`.
- Concurrency cancellation per branch/PR.
- Read-only repository permissions.
- Upload benchmark and failure diagnostics as artifacts.
- Run the same matrix on PRs and protected branch pushes.
- Keep jobs parallel, but use a single setup/cache strategy where practical.
- No format-only commit mixed into behavior commits.

Example command contract:

```json
{
  "check": "npm run format:check && npm run lint && npm run typecheck && npm test",
  "test:integration": "vitest run test/integration",
  "build": "npm run build",
  "boundary": "node scripts/boundary-scan.mjs",
  "benchmark": "node performance/graph-benchmark.mjs",
  "pack:check": "npm pack --dry-run"
}
```

## 10. Definition of done

- Authored `schemaVersion: 4` projects still load.
- No compatibility facade exists on any Track construction path.
- One qualified project graph and one long-lived ObservationState exist per loaded project.
- GraphBinding is the only mutation coordinator.
- GraphPublisher cannot mutate topology.
- One project-wide GraphRuntime, PatchRegistry, publisher, and clock subscription exist.
- Graph-owned Tracks never recursively compose graph dependencies.
- Track is a leaf and Motion is the sole composite.
- Clock, Interpolator, and Scheduler are real tested ports.
- Cross-motion and free-track membership work without capability flags.
- Lifecycle teardown is owner-first, idempotent, and leak-free.
- Core is renderer-neutral and imports no GSAP.
- React and DOM consume immutable patch batches.
- Tests, types, exports, docs, demos, and benchmarks describe only the new contract.
- Every gate measures behavior, API shape, boundaries, packaging, or mechanical formatting, never prose.

## 11. Final take

The right move is not “rewrite MotionPath with cleaner files.” It is to preserve the good mental model while making ownership impossible to misunderstand. Start with the leaf domain and graph kernel, make state stable and transactions authoritative, then add publication, adapters, and cross-project membership as vertical capabilities. The old repository is useful as a behavioral oracle and fixture source; it should not be the new repository's architecture template or history.
