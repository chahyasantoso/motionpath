# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 14:22 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest green baseline:** `c74601f`, 129 files and 712 tests green  
**Current slice:** `a125083` + `86ff633`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

P2-03 adapter parity and the full Node 24 matrix are green through the controlled
Engine path. The state-authoritative graph slice is now wired through lifecycle:
ObservationStateBridge supplies Track observer IDs from owner state and removes
source dependents before Track teardown. Track no longer has a reverse observer
map; `observerCount` and `observerIds` share one owner-backed source of truth.

## Completed in this slice

- Track reverse observer index removed: no `#observers`, `_addObserver`, or
  `_removeObserver`.
- `observerCount` derives from `observerIds`, preventing fallback divergence.
- ObservationStateBridge binds the temporary public observer snapshot provider.
- Source-destroy subscribers remove dependent Track edges from owner state before
  the source unregisters, preserving destroy snapshot ordering.
- Bridge parity and graph checks remain state-only after construction.
- Added tests for owner observer IDs, one-way hydration, drift immunity, graph
  parity, and source cleanup.

## Remaining work

1. Run the full matrix and strict boundary scan on this slice.
2. Remove the remaining Track-owned observation compatibility projection
   (`#observed`, `setObserved`, `removeObserved`, `replaceObserved`, and related
   public readers) by routing the complete Track observation contract through
   the injected owner/state facade. Preserve direct standalone behavior and the
   authored GraphBinding transaction contract before deleting the symbols.
3. Once Track observation symbols are gone, make strict P2-03 boundary green.
4. Keep topology/playback findings for P2-04; do not mix that deletion into this
   ownership cut.

## Guardrails

Keep compatibility as the default. Do not weaken parity literals. Do not flip
`publisherRendering`, `crossMotion`, or `freeTracks` defaults. If modes disagree,
assume the compatibility path is wrong until the state and lifecycle contract
proves otherwise.

## Verification

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
```
