# MotionPath v5 pass-2 implementation report

**Date:** 2026-08-09, Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Scope:** failure-log analysis, PR #142 repair baseline, and scoped-adapter migration review

## Current decision

PR #142 remains the frozen green repair baseline. The first PR #143 scoped-adapter implementation was reverted after its Node 24 run expanded to 33 failures. The failure cluster was not independent regressions: the adapter rewrite changed the established composition-context protocol, so ordinary standalone folds returned empty patches, mutual observation recursed, and diamond memoization broke.

## This slice

Added characterization coverage for output folds, input-before-local ordering, public context keys, mutual-cycle fallback, and diamond memoization. These tests intentionally exercise the existing green adapter contract before another ownership change is attempted.

## Correct next design

1. Keep the green adapter implementation untouched.
2. Add characterization tests against the current contract: output/input folds, mapFn replacement, mutual cycles, diamond memoization, public context keys, lightweight tracks, destroy snapshots, duplicate IDs, and runtime disposal.
3. Introduce a scoped ownership abstraction behind the existing adapter API, preserving the exact compose protocol.
4. Switch one ProjectRuntime path at a time, run the full suite, and only then remove the global compatibility fallback.

Do not merge PR #143 as a migration yet. Do not flip publisher rendering, cross-motion, or free-track defaults.
