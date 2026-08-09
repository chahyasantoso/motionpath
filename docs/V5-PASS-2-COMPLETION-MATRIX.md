# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 18:10 Asia/Jakarta  
**Control sheet:** pass-2 revision A  
**Active implementation:** [PR #145](https://github.com/chahyasantoso/motionpath/pull/145)

No row is complete from a docs-only commit, a stale head, or a non-blocking job.

| Target rule | Current status | Required closure evidence |
|---|---|---|
| Standalone adapter scope (F-02) | **Behavior mostly closed.** Engine-created Tracks share ProjectRuntime; direct legacy mutations adopt one explicit adapter. | Green direct-construction isolation and teardown suite |
| Standalone ownership parity | **Behavior open.** Adapter parity passes, but direct Track migration still has red composition/lifecycle cases. | Full matrix green on final head |
| Track is a leaf | **Migration in progress.** Constructor facade installation is removed; explicit compatibility boundaries remain. | All direct callers migrated and boundary passes |
| ObservationState owns authored graph state | **Mostly closed.** State-first authored mutation is in place; compatibility coverage remains explicit. | Owner-only mutation and lifecycle evidence |
| Cycle authority | **Closed for authored path.** GraphPublisher no longer installs Track guards. | Green owner-based cycle regression and stale-test migration |
| Graph/patch immutability | **Closed for this pass.** Existing evidence remains green. | None |
| GSAP isolation | **Partial and separate.** | P2-02/P2-05 cleanup |
| Publisher authority | **Separate and open.** Rendering remains default-off. | P2-05 evidence |
| Gates are real | **Repaired.** Protected and feature push triggers plus PR triggers are present. | Confirm nine jobs on next head |

## Rollout flags, all default-off

| Flag | Default | Owner |
|---|---|---|
| `observationOwnership` | `compatibility` | `Engine`, `ProjectRuntime` |
| `publisherRendering` | off | `Engine`, `GraphRuntime` |
| `crossMotion` | off | `ProjectRuntime` capabilities |
| `freeTracks` | off | `ProjectRuntime` capabilities |

## Current PR state

- [#145](https://github.com/chahyasantoso/motionpath/pull/145) is the only active implementation PR for this slice.
- [#143](https://github.com/chahyasantoso/motionpath/pull/143) remains the earlier scoped-adapter PR and is not the active facade-removal head.
- [#142](https://github.com/chahyasantoso/motionpath/pull/142) is closed as the frozen repair baseline.
