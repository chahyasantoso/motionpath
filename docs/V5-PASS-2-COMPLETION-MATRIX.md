# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 18:34 Asia/Jakarta  
**Control sheet:** pass-2 revision A  
**Active implementation:** [PR #145](https://github.com/chahyasantoso/motionpath/pull/145) at `ddcc3ffbc6c1d51d18755c90b56c880fe5c7d8e7`  
**Review:** [`V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md)

No row is complete from a docs-only commit, stale head, non-blocking job, duplicate workflow run, source-only scan, or alias-based parity test.

| Target rule | Current status | Required closure evidence |
|---|---|---|
| Standalone adapter scope (F-02) | **Open.** ProjectRuntime owns an adapter, but direct construction has per-Track and module-global defaults, and facade mutation can silently re-home Tracks. | Explicit scope contract, cross-owner rejection, no edge loss during transfer |
| Standalone ownership parity | **Unproven.** Compatibility is a re-export alias of scoped, so both modes execute the same class. | Independent compatibility oracle or removal of the two-mode claim |
| Track is a leaf | **Open.** Track-local maps are gone, but Track imports a legacy helper and `createTrack` installs the facade on production authored Tracks. | Runtime symbol-ban on Engine-authored Tracks and neutral lifecycle contract |
| ObservationState owns authored graph state | **Partial.** Controller mutation is state-first, but previous standalone owner state can remain live and reappear after unbinding. | Atomic ownership transfer and bind/mutate/unbind regression |
| Cycle authority | **Mostly closed.** GraphPublisher guard is removed and authored mutation validates in ObservationState/normalization. | Green failure-atomic cycle suite on final head |
| Lifecycle compatibility | **Open.** Legacy remove lacks invalidation and destroyed lifecycle events lost `observerIds`. | Locked add/remove/replace/detach/destroy event contract |
| Transaction integrity | **Open.** Covered rollback paths preserve mappers, but late-track wiring can mutate through both override and controller. | Owner-only authored mutation and indexed fault-injection tests |
| Runtime symbol ban | **Open.** Static Track.js scan passes while factory-installed runtime properties remain. | Static scan plus runtime surface tests for all construction paths |
| Public API/type parity | **Open.** `createObservationScope` has no declaration; supported runtime injection is unclear. | Package type tests covering every new export and option |
| Graph/patch immutability | **Closed for this pass.** Existing evidence remains green. | None for P2-03 |
| GSAP isolation | **Partial and separate.** | P2-02/P2-05 cleanup |
| Publisher authority | **Separate and open.** Rendering remains default-off. | P2-05 equivalence and rollout evidence |
| Gates are real | **Open.** Strict boundary and benchmarks block, but unit tests fail, CI runs twice, and format checks no source. | One all-green matrix and source format coverage |

## Rollout flags

| Flag | Default | Current evidence |
|---|---|---|
| `observationOwnership` | `compatibility` | Not behaviorally meaningful while compatibility aliases scoped |
| `publisherRendering` | off | Preserved |
| `crossMotion` | off | Preserved |
| `freeTracks` | off | Preserved |

## Exact-head gate state

PR #145 produced two nine-job matrices on `ddcc3ff`. Both unit-test jobs failed. Format, typecheck, build, package dry run, default boundary, strict boundary, rig benchmark, and baseline jobs passed in both runs. The format result covers only `package.json` and `.github/workflows/ci.yml` and is not evidence that source is formatted.

## Closure sequence

Fix the unit failures and duplicate CI first. Then remove production facade installation, reject implicit owner migration, eliminate stale dual ownership, restore lifecycle contracts, remove double mutation, make the ownership rollout honest, complete public types, and add runtime symbol-ban coverage. Close P2-03 only after one complete green matrix on the exact merge ref.
