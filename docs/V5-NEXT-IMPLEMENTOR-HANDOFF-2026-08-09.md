# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 14:51 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest green baseline:** `c74601f`, 129 files and 712 tests green  
**Current slice:** `030a326` + `65521e`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

The large P2-03 projection cut is implemented but not yet verified. Track no longer
stores `#observed` or composes from local observation state. Its observation API,
edge readers, clearing, replacement, composition, and observer IDs route through
the injected owner facade; standalone Tracks use the runtime adapter and authored
Tracks use GraphBinding's ObservationTrackController.

## Completed in this slice

- Removed Track's local observation map and local composition walker.
- Added owner-backed Track forwarding for mutation, readers, compose and cleanup.
- Injected GraphBinding's state-backed controller into authored Tracks.
- Made controller replacement tolerate GraphBinding's state-first transaction order.
- Kept compatibility public methods while callers migrate; no default changes.

## Verification required

Run the build first, then the full matrix. Expected follow-ups are likely contract
adjustments in mocks and lifecycle tests because authored Tracks now require the
controller for observation writes. Strict P2-03 boundary will still report public
compatibility symbols and graph-guard forwarding until those callers are migrated;
do not hide them with scanner exceptions.

```text
npm run build
npm test -- --reporter=verbose
npm run typecheck
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
```

## Next after green

Migrate remaining direct callers from Track observation methods/readers to the
controller, then delete the compatibility forwarding names and remove the strict
boundary findings. Keep child topology/playback for P2-04.
