# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 16:15 Asia/Jakarta  
**Control sheet:** pass-2 revision A  
**Implementor review:** [`V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-P2-03-IMPLEMENTOR-REVIEW-2026-08-09.md)

No row is complete from a docs-only commit or a non-blocking job.

| Target rule | Current status | Required closure evidence |
|---|---|---|
| Standalone adapter scope (F-02) | **Behavior closed, architecture exception open.** Engine-created Tracks use one ProjectRuntime adapter; direct construction still uses the compatibility fallback. | Explicit caller-owned direct scope, or a documented singleton exception with isolation proof |
| Standalone ownership parity | **Closed behaviorally.** Compatibility and scoped adapters share the locked scenario and runtime contracts. | Re-run on final closure head |
| Track is a leaf | **Open.** No local edge maps remain, but Track still installs the legacy observation facade. | Migrate callers, remove facade installation, retain compatibility coverage outside Track |
| ObservationState owns authored graph state | **Mostly closed.** State is authoritative for reads and rollback, but GraphBinding still dual-writes compatibility hooks. | Owner-only authored mutation and owner-generated lifecycle events |
| Cycle authority | **Open.** Normalization, ObservationState, and GraphPublisher/legacy guard still overlap. | One runtime authority, GraphPublisher no Track walk |
| Graph/patch immutability | **Closed for this pass.** Existing P2-01 evidence remains green. | None |
| GSAP isolation | **Partial and separate.** Core boundary passes; quarantine and renderer imports remain. | P2-02/P2-05 cleanup, not a P2-03 blocker |
| Publisher authority | **Separate and open.** Rendering remains default-off. | P2-05 equivalence, retention, payload-shape, rollback evidence |
| Gates are real | **Improved.** Strict boundary and benchmark jobs are now blocking in CI. | Final closure run on exact merge ref |

## Rollout flags, all default-off

| Flag | Default | Owner |
|---|---|---|
| `observationOwnership` | `compatibility` | `Engine`, `ProjectRuntime` |
| `publisherRendering` | off | `Engine`, `GraphRuntime` |
| `crossMotion` | off | `ProjectRuntime` capabilities |
| `freeTracks` | off | `ProjectRuntime` capabilities |

## Current PR state

- [#143](https://github.com/chahyasantoso/motionpath/pull/143) is draft and has a green behavioral matrix; strict closure is still required.
- [#142](https://github.com/chahyasantoso/motionpath/pull/142) remains the frozen repair baseline and must not merge.
- [#141](https://github.com/chahyasantoso/motionpath/pull/141) is closed as superseded.
