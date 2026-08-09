# MotionPath v5 status

**Status captured:** 2026-08-09 12:03 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)  
**Implementation report:** [`V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md`](./V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md)  
**Next implementor handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

PR #143 is green through the characterization phase. The opt-in scoped adapter harness is now added on the same draft branch, default-off and not wired into production runtime behavior. It needs its own full CI verification.

## Current progress

The existing composition protocol is locked. The harness has private ownership, public-ID contexts, cycle fallback, duplicate-ID isolation, and explicit disposal tests.

## Next in line

Run the full matrix, compare harness and existing adapter behavior, then add a default-off ProjectRuntime selector. Keep the global fallback until equivalence is proven.

## Guardrails

Do not merge the harness until its full CI matrix is green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off. Do not weaken readability or boundary tests.
