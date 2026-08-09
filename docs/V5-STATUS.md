# MotionPath v5 status

**Status captured:** 2026-08-09 11:49 Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)  
**Implementation report:** [`V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md`](./V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md)  
**Next implementor handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

PR #142 is the frozen green repair baseline. PR #143's first scoped-adapter implementation produced 33 failures and has been rolled back on this draft branch. The migration is not ready to merge.

## Completed repair baseline

- Explicit-null handling preserves authored-graph ownership semantics.
- GraphBinding rollback restores ObservationState and live Track wiring, including map functions.
- O(1) observation lookups remove the registry-clone timeout path.
- Track, owner, format, and boundary readability gates are green.

## Current migration state

The scoped-owner code is intentionally not active. The next attempt must preserve the existing compose protocol exactly and add characterization tests before changing ownership internals.

## Next in line

Characterize and then migrate scoped ownership behind the existing adapter API. Keep the global compatibility fallback until the new path is proven equivalent across folds, cycles, memoization, duplicate IDs, teardown, and disposal.

## Guardrails

Do not merge PR #143 yet. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off. Do not weaken readability or boundary tests.
