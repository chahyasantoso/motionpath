# Pass-2 review resolution log

**Tracks:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md)  
**Branch:** `v5`  
**Updated:** 2026-08-09 08:30 Asia/Jakarta

F-02 exposed a concrete regression after the first runtime-boundary implementation: a shared adapter keyed its state by local `Track.id`, so valid qualified instances such as `left/bone` and `right/bone` collided. The adapter now assigns an internal identity key per Track object (`bone#N`) while preserving the public local id and Track prototype. Observation edges and lifecycle cleanup use the internal key; public queries still return local Track ids.

The regression was found by `qualifiedIds.test.js` and fixed on `v5` in commit `8f33f4e`. The next CI run is the verification gate.

## Current finding status

F-01 open. F-02 implementation fixed and awaiting CI verification. F-03, F-06, F-07, F-08, and F-10 remain open and block the Track observation symbol-ban. F-04, F-05, F-11, F-12, F-14, and F-16 are closed.

## Next

After the duplicate-id regression is green, proceed with F-01: make `ObservationState` authoritative, migrate GraphBinding and GraphPublisher off `Track.observedEdges`, then move observer queries onto the state before deleting Track's duplicate bookkeeping.
