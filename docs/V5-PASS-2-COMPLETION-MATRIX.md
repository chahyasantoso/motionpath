# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 09:52 Asia/Jakarta  
**Control sheet:** pass-2 revision A  
**Current handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

| Target rule | Current status | Next required evidence |
|---|---|---|
| Track is a leaf | Open. Track still owns compatibility observation state and topology/playback seams. | Final symbol-ban and lifecycle suites |
| ObservationGraph owns graph state | Open and currently regressed in repair work. GraphBinding still projects from Track. | ObservationState-authoritative wiring, parity, rollback, source removal |
| Graph/patch immutability | Merged P2-01 evidence remains valid, but rerun after repair. | Full immutability suite |
| GSAP isolation | Partial. Core boundary passes; fake-backed production construction remains open. | Strict boundary and shrinking quarantine |
| Publisher authority | Default-off and incomplete. | Equivalence, retention, rollback, payload-shape evidence |
| Gates are real | CI duplication was fixed on #142 branch, but #142 unit tests still fail. | One PR workflow, full unit gate green |

## Current PR state

- [#142](https://github.com/chahyasantoso/motionpath/pull/142) is draft, head `3a60b15`, base `v5`, and **must not merge**.
- [#141](https://github.com/chahyasantoso/motionpath/pull/141) is closed as superseded.
- Latest known #142 unit run: **78 failed tests** at merge ref `0b9bc30`, caused primarily by explicit-null adapter fallback. The explicit-null fix is present in the branch but requires a fresh green unit run.

No matrix row should be marked complete from the repair PR until the full gate passes.
