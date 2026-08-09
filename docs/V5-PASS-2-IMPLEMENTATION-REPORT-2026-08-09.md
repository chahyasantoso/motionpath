# MotionPath v5 pass-2 implementation report

**Date:** 2026-08-09, Asia/Jakarta  
**Branch:** `fix/pass2-f02-regressions-v2`  
**Scope:** failure-log analysis, regression repair, and the next F-02 ownership slice

## Executive summary

The attached run had three failures, but they came from three different causes. The code-style failure was real. The transaction failure exposed asymmetric rollback. The fuzz timeout was a performance bug in the ownership compatibility layer, not a flaky test.

The repair landed in two commits on the active branch and the follow-up ownership slice is now included. CI subsequently reported all eight jobs green, including unit tests, typecheck, build, package dry run, format, boundary scan, and the two informational benchmark jobs.

## Findings and solutions

### 1. Readability floor

`Track.js` had only 2.1% comment lines against a 5% floor. The implementation had been compressed while removing the reasoning that explains adapter precedence, dual-write compatibility, composition ordering, and destroy ordering.

**Solution:** restored the invariant comments without weakening the guard or changing behavior. The comments are now part of the maintained evidence boundary.

### 2. GraphBinding rollback lost `mapFn`

GraphBinding wrote ObservationState, then the live Track, then rebuilt the bridge from ObservationState during commit. On a rejected publisher commit, rollback restored only the Track. The state still held the candidate edge set, so the next bridge rebuild reintroduced a missing edge without its original mapper. Edge-key parity stayed green because it inspected Track wiring, while composed values exposed the data loss.

**Solution:** rollback now snapshots edges from ObservationState, restores state first, then restores Track wiring, and always carries the original `mapFn`. Add, remove, and replace transactions now restore both authorities symmetrically.

### 3. Fuzz timeout was quadratic

`StandaloneObservationAdapter.getEdges()` resolved each edge through `owner.tracks`, a getter that cloned the full registry. The owner was module-global, so the clone grew with every Track created by prior tests. The mutation fuzz suite paid that clone once per edge lookup and timed out.

**Solution:** added O(1) owner lookup and a Track-to-key cache, plus non-cloning internal edge reads in ObservationState. The follow-up removed the module-global registry entirely, so adapter cost and lifetime are scoped to the owning runtime.

### 4. Standalone ownership was globally leaked

The compatibility bridge used module-global owner/maps to make independently constructed Tracks observe each other. That avoided unknown-track errors but leaked ownership across runtimes and tests, and made cleanup nondeterministic.

**Solution:** `StandaloneObservationAdapter` now owns a local `TrackObservationOwner`. `ProjectRuntime` already injects one adapter across its standalone Tracks, giving an Engine/project a shared scope. Direct Track callers retain compatibility: the observer adapter registers the source locally, so cross-adapter composition works without global state. Destroy callbacks snapshot observer IDs from the owning adapter before edge cleanup.

## Verification

The previously failing branch run was followed by an eight-job green CI run on PR #142. The required blocking evidence is now green. Benchmarks remain informational because the workflow intentionally uses `continue-on-error` for those jobs.

## What remains

The next architectural slice is F-01: make ObservationState the single writer and graph authority, then migrate the remaining `Track.observedEdges` consumers. The remaining consumers are `GraphBinding.#assertTrackGraphMatches`, `ObservationStateBridge` parity logic, and `GraphPublisher.#graphGuard`. After those move, delete Track's duplicate observation maps and compatibility ownership symbols in a separate, test-backed slice.

Do not flip publisher rendering, cross-motion, or free-track defaults while that migration is underway.
