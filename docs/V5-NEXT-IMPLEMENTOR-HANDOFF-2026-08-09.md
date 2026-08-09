# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 14:42 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest green baseline:** `c74601f`, 129 files and 712 tests green  
**Current slice:** `92c30c3` + `70e846e`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

The remaining P2-03 job is the Track projection deletion. The first safe seam is
landed: `ObservationTrackController` is a state-backed external facade for edge
mutation, replacement, reads, clearing, composition, and observer IDs. It now
registers endpoints before mutation, so direct facade use does not depend on
Track-local reverse state.

## Completed

- Adapter ownership is runtime-scoped and process globals are gone.
- ObservationStateBridge hydrates once, then checks state only.
- GraphBinding validates normalized IR against owner state and owns transaction
  rollback snapshots there.
- Track reverse observer index is gone; observer IDs/counts are owner-backed.
- Source-destroy cleanup and subscription disposal are lifecycle-safe.
- External observation controller contract is tested for input/output edges,
  replacement, removal, clearing, composition, endpoint registration, and direct
  observer-ID reads.

## Remaining jobs

1. Run the full matrix on `92c30c3`.
2. Inject `ObservationTrackController` into Track construction for authored graphs
   and route Track observation methods/readers through it, preserving standalone
   adapter behavior during the transition.
3. Delete Track's `#observed` projection and compatibility-only mutation branches.
4. Make strict P2-03 boundary green. Keep child topology/playback for P2-04.

## Guardrails

Keep compatibility as the default. Do not weaken parity literals. Do not flip
`publisherRendering`, `crossMotion`, or `freeTracks` defaults. If modes disagree,
assume compatibility is wrong until proven otherwise.

## Verification

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
```
