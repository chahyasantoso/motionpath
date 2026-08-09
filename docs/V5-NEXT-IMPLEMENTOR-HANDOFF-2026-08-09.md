# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 12:09 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

PR #143's pre-harness head was green. The opt-in scoped harness exposed two protocol bugs in its own tests: it returned internal edge source keys incorrectly and pre-seeded the root `COMPOSING` marker, skipping the root's edges. Both are corrected in the harness only; production adapter behavior remains untouched.

## Required verification

Run the full Node 24 matrix on commit `854f256` before integrating the harness. Do not wire it into Track or ProjectRuntime until the harness and protocol comparison suite are green.

## Next work

Compare the scoped harness against the existing adapter across the locked characterization suite, then add a default-off ProjectRuntime selector. Remove the global fallback only after equivalence is proven.

## Guardrails

Keep PR #142 frozen and green. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
