# MotionPath v5 pass-2 implementation report

**Date:** 2026-08-09, Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Scope:** failure-log analysis, PR #142 repair baseline, and scoped-adapter migration review

## Current decision

PR #142 remains the frozen green repair baseline. The first PR #143 scoped-adapter implementation was reverted on this branch after its Node 24 run expanded to 33 failures. The failure cluster was not independent regressions: the adapter rewrite changed the established composition-context protocol, so ordinary standalone folds returned empty patches, mutual observation recursed, and diamond memoization broke.

## What is retained

- Explicit-null handling in `createTrack`.
- GraphBinding rollback that restores ObservationState and Track wiring, including `mapFn`.
- O(1) lookup improvements on the hot observation path.
- Readability and destroy re-entrancy fixes.

## What was reverted

The private-owner migration is not merged. A private `TrackObservationOwner` per adapter is architecturally desirable, but it cannot replace the current compatibility layer by changing ownership alone. The existing `COMPOSING` marker, public Track-ID context, lightweight test-track behavior, and cross-adapter fallback are part of the compatibility contract and need explicit characterization before any implementation swap.

## Correct next design

1. Keep the green adapter implementation untouched.
2. Add characterization tests against the current contract first: output/input folds, mapFn replacement, mutual cycles, diamond memoization, public context keys, lightweight tracks, destroy snapshots, duplicate IDs, and runtime disposal.
3. Introduce an ownership abstraction behind the existing adapter API, preserving the exact compose protocol.
4. Switch one ProjectRuntime path at a time, run the full suite, and only then remove the global compatibility fallback.

Do not merge PR #143 as a migration yet. Do not flip publisher rendering, cross-motion, or free-track defaults.
