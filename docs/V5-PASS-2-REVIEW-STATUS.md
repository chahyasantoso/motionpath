# Pass-2 review resolution log

**Tracks:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md)  
**Branch:** `v5`  
**Updated:** 2026-08-09 08:37 Asia/Jakarta

The first F-02 identity-key fix was structurally correct in the source, but the CI run at `c884471` still reported duplicate local-id failures in `qualifiedIds.test.js`. Treat that run as the failing regression evidence, not as noise.

The fix is now backed by a focused adapter test that constructs two Track objects with the same public local id, wires one to the other, composes successfully, and checks identity-preserving queries and cleanup. Re-run the full gate before advancing to F-01.

## Current finding status

F-01 open. F-02 implementation fixed and awaiting CI verification after the focused regression test. F-03, F-06, F-07, F-08, and F-10 remain open and block the Track observation symbol-ban. F-04, F-05, F-11, F-12, F-14, and F-16 are closed.

## Root-cause conclusion

The failure is a namespace-versus-identity boundary bug. Public Track ids are intentionally motion-local and may repeat across qualified instances (`left/bone`, `right/bone`), while the standalone ObservationState registry needs unique node keys. Using `Track.id` as the state key makes valid independent instances collide. The adapter must therefore keep a private identity key per Track object and translate only at its public query boundary. The regression test now locks that contract.

## Next

After this run is green, proceed with F-01: make `ObservationState` authoritative, migrate GraphBinding and GraphPublisher off `Track.observedEdges`, then move observer queries onto the state before deleting Track's duplicate bookkeeping.
