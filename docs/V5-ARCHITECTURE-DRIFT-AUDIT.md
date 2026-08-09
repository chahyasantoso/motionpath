# MotionPath v5 architecture drift audit

**Compared:** restored original architecture plan at `7d007a0` against repository head `c955297`  
**Branch:** `feat/pass2-track-facade-removal`  
**Date:** 2026-08-09  

## Executive summary

The new system is not a failed implementation of the original architecture. It is a **partially implemented architecture with a good runtime foundation and an unfinished ownership model**. The strongest pieces are immutable graph metadata, immutable renderer-neutral patches, staged project membership, explicit clocks, transaction-oriented graph binding, and authored plugin-input validation. The weakest pieces are that live observation ownership is split across too many classes, graph runtime is still motion-scoped in `Engine`, `Track` still owns topology/playback bridges, compatibility code still enters the Track construction path, and several accepted architecture decisions exist as scaffolding rather than the active runtime path.

The blunt score: **about 60% of the original target is materially implemented, about 25% is partially implemented or running behind a compatibility seam, and about 15% is still missing or contradicted by the active path.** This is an engineering judgment, not a test-pass percentage.

## 1. What the original architecture required

The restored plan defines these core rules:

- `Track` is a leaf that samples and composes its own plugin output.
- `Motion` is the sole permanent composite and owns topology, scheduling, and playback.
- Topology is a tree; observation is a separate DAG.
- GSAP is behind adapter ports.
- One graph owner exists per runtime scope, ending at one project-scoped owner.
- Published patches are immutable and renderer-neutral.
- Mutations, mount, unmount, reload, and flush are atomic.
- Graph state is validated and ordered canonically.
- Compatibility belongs at migration boundaries, not inside `Track` or `Motion`.
- Cross-motion and free-track capabilities remain gated until their evidence exists.

## 2. Decision-by-decision audit

| Architecture decision | Status at `c955297` | What is good | What is bad / remaining |
|---|---|---|---|
| AD-1 staged graph scope | **Partial** | `ProjectRuntime` exists with staged candidates, membership, pending references, capabilities, and qualified ordering. | `Engine.#mountMotion` still creates a `GraphRuntime` per Motion. `ProjectRuntime.attachGraphRuntime()` is not the active assembly path, so project-wide graph ownership is not real yet. |
| AD-2 immutable patch contract | **Good** | `PatchRegistry` publishes `nodeId`, revision, values, source progress, source revisions, and status. Values are deeply immutable and batches prevent partial subscriber visibility. | Patch source revisions are derived from the registry snapshot, not yet a fully proven project-wide publisher contract. |
| AD-3 explicit clock ownership | **Good / partial** | `GraphRuntime` subscribes to an injected clock and flushes once per tick. `FakeClock` and clock ports exist. | Multiple Motion runtimes mean multiple flush domains. This is correct locally, not yet the final project-wide model. |
| AD-4 transaction boundaries | **Good / partial** | `GraphBinding` and `ProjectRuntime` use staged candidates, rollback, and explicit disposal. `GraphRuntime.flush()` batches patches. | The active Engine path still has compatibility and alternate-runtime branches, so the single committed-state story is not complete. |
| AD-5 public API follows ownership | **Good** | Public `index.js` exposes domain APIs while `internal.js` contains graph/runtime internals. | There is no final `exports` map yet, and internal reachability still relies on package structure rather than a hard package boundary. |
| AD-6 source-unmount semantics | **Good / partial** | `ProjectRuntime.unregisterInstance()` removes source references and records `SOURCE_UNMOUNTED`; `ObservationState.removeSourceEdges()` invalidates dependents. | The two implementations have different cleanup paths, and stale-owner behavior remains part of the open P2-03 gates. |
| AD-7 independent timeline semantics | **Good locally** | Motion progress and graph composition are separate; observed sources are sampled rather than controlled. | Cross-motion capability is not the final project runtime path, so this is proven mainly in local graph scenarios. |
| AD-8 canonical ordering | **Contradicted in one active path** | `ProjectRuntime.qualifiedMembershipOrder` sorts qualified IDs canonically and separates free-track namespace. | `normalizeObservationGraph.tryTopologicalOrder()` uses declaration position as the tie-breaker. The graph flush order is therefore not guaranteed to be canonical. |
| AD-9 staged validation and atomic visibility | **Good / partial** | Candidate membership, pending references, commit, abort, and resource cleanup are implemented. | Graph normalization still uses local bare IDs, while project membership uses qualified IDs. The two layers are not unified. |
| AD-10 compatibility-composite shadowing | **Missing** | The migration addendum clearly specified fixture validation and a temporary `CompositeRuntime`. | No `CompositeRuntime` was found. The old group-host path was replaced directly instead of being shadow-compared through the specified adapter. |
| AD-11 authored inputs vs standalone defaults | **Partial** | `graph-inputs.js` makes authored-graph the default, validates missing and duplicate plugin inputs, and preserves standalone mode. | `GRAPH_INPUT_ROLE_MISMATCH` is missing. Plugin metadata is still flat `inputs: [...]`; the accepted `{ requiredInGraph, standaloneDefault }` contract is not implemented. |

## 3. What is already built well

### 3.1 ObservationGraph is a useful immutable IR

`ObservationGraph` is not the live owner. It is a frozen, renderer-neutral value object containing normalized nodes, edges, order, diagnostics, and adjacency indexes. That is a sound implementation refinement of the original architecture: the architecture says the graph owns metadata and validation, and this object is the immutable graph IR after parsing.

The good part is the separation from Track instances and plugin functions. Publishers and bindings do not need to rebuild indexes from live Tracks. Deep immutable-value handling also closes a class of accidental mutation bugs.

### 3.2 ObservationState is a legitimate runtime concept, but undocumented

`ObservationState` holds the mutable live wiring: registered Track objects, target edges, reverse observer indexes, cycle checks, invalidation, and recursive composition. That is exactly the state a runtime needs after an immutable graph plan has been compiled.

The problem is not that ObservationState exists. The problem is that the architecture document never names the distinction between:

```text
ObservationGraph = immutable normalized plan / IR
ObservationState = mutable committed runtime wiring
```

Without that distinction, the code looks like architectural drift, and the implementation accumulated several wrappers around it: `GraphBinding`, `ObservationTrackController`, `ObservationStateBridge`, `TrackObservationOwner`, and the two observation adapters.

**Recommendation:** update the architecture document with an explicit AD-12, then reduce the live owner path to one project-scoped `ObservationState` behind `ProjectRuntime` or `GraphRuntime`. Keep adapters as capability boundaries, not competing graph owners.

### 3.3 Patch publication is stronger than the original minimum

`PatchRegistry` deep-freezes patch values and source revision maps. It batches notifications, suppresses unchanged revisions, and exposes node subscriptions plus snapshots. This is better than merely returning immutable patch envelopes: it establishes a useful publication protocol.

### 3.4 ProjectRuntime has the right transaction vocabulary

`ProjectRuntime` supports candidate creation, staged registration, pending references, atomic commit, abort cleanup, qualified membership, capability checks, instance lifecycle, and source-unmount diagnostics. Even though Engine does not fully wire it into one graph yet, the ownership boundary is well-shaped.

### 3.5 The GSAP boundary is enforced, not just documented

The blocking GSAP boundary test and shared allowlist exist. Production orchestration imports the adapter surface rather than importing GSAP directly. The quarantine list is explicit and can only shrink. That is the right kind of architectural guard.

### 3.6 Authored graph input validation exists

The validator distinguishes `authored-graph` from `standalone`, defaults project tracks to authored graph mode, and catches missing or duplicate required inputs. This closes a real correctness hole where plugin defaults could conceal malformed authored rigs.

## 4. What is bad or incomplete

### 4.1 Observation ownership is over-factored

The original plan names one `ObservationGraph` owner. The current system has at least these observation-related layers:

- `ObservationGraph`: immutable normalized metadata
- `ObservationState`: mutable edge and reverse-index state
- `GraphBinding`: mutation and transaction coordinator
- `ObservationTrackController`: controller seam
- `ObservationStateBridge`: parity and hydration oracle
- `TrackObservationOwner`: standalone owner facade
- `StandaloneObservationAdapter`: compatibility owner
- `ScopedObservationAdapter`: alternate scoped owner

Some separation is healthy. Eight overlapping ownership concepts are not. The current structure makes every mutation answer three questions: which object stores the edge, which object is authoritative, and which object should receive cleanup. That is why P2-03 keeps rediscovering stale-owner, rollback, and lifecycle defects.

### 4.2 Track is still not a leaf

`Track.js` still contains child topology (`addChild`, `removeChild`), host bridging, and playback controls (`play`, `pause`, `seek`, `reverse`). It also imports `createDestroyEvent` from `LegacyObservationFacade.js`, while `createTrack.js` still installs the facade. This directly contradicts the original leaf rule and compatibility-boundary rule.

The code comments call these P2-04 seams, but comments do not change ownership. This is deferred architecture, not completed architecture.

### 4.3 Motion is not yet the sole composite

`Motion` is the active scheduler and does own most composite behavior, which is good. But Track still calls Motion child-host methods, and compatibility aliases remain. The desired topology extraction is therefore structurally incomplete even though the direction is correct.

### 4.4 ProjectRuntime exists beside, not above, Motion runtimes

This is the biggest runtime wiring gap. `Engine.#mountMotion()` chooses between `GraphRuntime` and `GraphPublisher` plus `GraphBinding` per Motion. The project runtime registers instances but does not become the one publisher/graph/clock owner.

The result is a hybrid architecture: project membership is global, graph publication is local. That is acceptable as a migration stage, but the docs must call it a stage, not the target architecture.

### 4.5 The graph identity model is split

The normalized graph uses local IDs such as `trackA`. `ProjectRuntime` uses qualified IDs such as `motionId/trackA` and reserves `~/` for free tracks. Until all graph edges use qualified IDs, cross-motion and reload behavior will remain vulnerable to collisions and ambiguous references.

### 4.6 The migration gates are inconsistent

The architecture plan says `CompositeRuntime` must shadow the real group-host demo before replacement. The current repository has no such adapter. The plan says compatibility is at migration boundaries, but the active Track factory still installs a legacy facade. The plan says one project-scoped graph owner, but the active Engine creates one graph runtime per Motion.

These are not cosmetic doc mismatches. They make it difficult to know which implementation is authoritative.

## 5. Per-phase status

| Phase | Status | Evidence |
|---|---|---|
| 0 characterization and guardrails | **Mostly complete** | Regression suites, boundary tests, readability tests, benchmarks, and explicit CI scripts exist. |
| 1 lifecycle and graph transactions | **Mostly complete** | GraphBinding transactions, disposal, rollback tests, and cycle handling exist; stale-owner and cleanup gates remain. |
| 2 runtime scope and compatibility boundary | **Partial** | GraphRuntime, fake clock, PatchRegistry, and diagnostics exist; compatibility facade is still installed by `createTrack`. |
| 3 publisher migration and shadow validation | **Partial / wrong sequence** | Publisher path exists, but the specified `CompositeRuntime` live shadow gate is missing. |
| 4 manual-trigger Motion compatibility | **Implemented without the specified shadow gate** | `createMotionHost` and explicit autoplay handling exist; characterization against the old path is not represented by `CompositeRuntime`. |
| 5 composite collapse and recursive scheduling | **Partial** | Motion schedules tracks and has recursive-oriented APIs, but Track still owns topology/playback bridges. |
| 6 ports and adapter isolation | **Mostly complete** | Adapter imports and GSAP boundary test exist; quarantine still contains test imports. |
| 7 FK contract and graph extraction | **Partial** | ObservationGraph, graph-inputs validation, and ObservationState exist; live ownership is split and plugin metadata contract is incomplete. |
| 8 publish-only same-motion runtime | **Partial** | GraphRuntime and PatchRegistry exist, but Engine retains publisher-off and alternate binding branches. |
| 9 ProjectRuntime | **Partial / foundation built** | Candidate commit and qualified membership exist; ProjectRuntime is not the active graph publisher for mounted motions. |
| 10 cross-motion/free-track capability | **Scaffolded and disabled** | Capability checks, references, pending state, and free-track namespace exist; defaults remain off and end-to-end proof is absent. |
| 11 API cleanup and measured optimization | **Partial** | Internal exports and benchmarks exist; final exports map, complete cleanup, and public TypeScript closure remain. |

## 6. Recommended target shape

Do not delete `ObservationState` just because it is absent from the original document. **Name it and constrain it.** The clean target should be:

```text
ProjectRuntime
  owns one ObservationState
  owns one ObservationGraph (immutable committed plan)
  owns one GraphPublisher
  owns one Clock

ObservationGraph
  immutable nodes, edges, diagnostics, order, adjacency indexes

ObservationState
  mutable committed wiring, reverse indexes, lifecycle invalidation, cycle checks

GraphBinding
  transaction coordinator only; no second source of truth

Motion
  recursive topology and scheduling

Track
  interpolation and plugin composition only

Adapters
  GSAP, DOM, React, clock, and standalone capability boundaries
```

Then remove or demote:

- `ObservationStateBridge`: test-only oracle, delete after golden fixtures exist.
- `TrackObservationOwner`: delete when standalone ownership is unified.
- `StandaloneObservationAdapter` and `ScopedObservationAdapter`: collapse to one explicit adapter contract.
- `ObservationTrackController`: retain only if it is a thin transaction port, not a second owner.
- `GraphBinding`: retain as the sole mutation coordinator.

## 7. Hard-break implications

The zero-compatibility report is directionally right, but it should not delete ObservationState. A hard break should delete **compatibility projection**, not **runtime state**.

Delete:

- `LegacyObservationFacade` and its Track monkey-patching.
- Implicit `_adoptObservationOwner` and owner re-homing.
- The fake `compatibility` vs `scoped` rollout mode.
- `ObservationStateBridge` after golden characterization fixtures are captured.
- Duplicate standalone owner implementations.
- Publisher-off and legacy binding branches once the unified path is green.

Keep and clarify:

- `ObservationGraph` as immutable graph IR.
- `ObservationState` as the sole mutable runtime wiring store.
- `GraphBinding` as transaction coordinator.
- `ProjectRuntime` as the one scope owner.
- `GraphRuntime` or its publisher internals, but not two competing assembly paths.

## 8. Bottom line

The new system has built the hard infrastructure: immutable values, patch publication, graph normalization, transaction vocabulary, project membership, clock ports, and adapter boundaries. It has not finished the architecture's central promise: **one owner, one graph runtime, Track as a leaf, and one authoritative path**.

ObservationState is not the drift. The undocumented split between immutable graph IR and mutable runtime state is the drift. Add that distinction to the architecture, then finish the wiring cleanup around it.
