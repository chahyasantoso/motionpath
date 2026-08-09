# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 13:20 Asia/Jakarta  
**Control sheet:** pass-2 revision A  
**Current handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

No row may be marked complete from a green docs-only commit, and no row may be
marked complete from a `continue-on-error` job.

| Target rule | Current status | Next required evidence |
|---|---|---|
| Standalone adapter scope (F-02) | **Closed for the runtime path.** `ProjectRuntime` owns one adapter and `Engine` injects it into every standalone Track. | `createTrack` and the `Track` constructor stop building their own fallback adapter |
| Standalone ownership is replaceable | **Proven.** One scenario runner, both owners, every locked contract, plus the full `Engine` path. Scoped is opt-in and green. | Matrix re-run on the integration commits |
| Track is a leaf | Open. Track still owns the compatibility reverse index and the topology/playback seams. | Adapter-scope step above, then symbol-ban and lifecycle suites |
| ObservationGraph owns graph state | Open. `GraphBinding` still projects from Track and the bridge still derives state from `Track.observedEdges`. | State-authoritative wiring, parity, rollback, source removal |
| Graph/patch immutability | Merged P2-01 evidence valid and re-run green. | None outstanding for this pass |
| GSAP isolation | Partial. Core boundary passes; the quarantine list is non-empty and `packages/react` imports gsap directly. | Strict boundary green and a shrinking quarantine |
| Publisher authority | Default-off and incomplete. | Equivalence, retention, rollback, payload-shape evidence |
| Gates are real | Improved. One PR workflow, full unit gate green, readability floor and boundary scan running. | Format gate covering source files, strict boundary scan blocking |

## Rollout flags, all default-off

| Flag | Default | Owner |
|---|---|---|
| `observationOwnership` | `compatibility` | `Engine`, `ProjectRuntime` |
| `publisherRendering` | off | `Engine`, `GraphRuntime` |
| `crossMotion` | off | `ProjectRuntime` capabilities |
| `freeTracks` | off | `ProjectRuntime` capabilities |

## Current PR state

- [#143](https://github.com/chahyasantoso/motionpath/pull/143) is draft. The full
  Node 24 matrix is green at `99e37de`. Integration commits above it need a re-run.
- [#142](https://github.com/chahyasantoso/motionpath/pull/142) is the frozen green
  repair baseline at `184f194` and **must not merge**.
- [#141](https://github.com/chahyasantoso/motionpath/pull/141) is closed as
  superseded.
