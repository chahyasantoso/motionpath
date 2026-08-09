# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 11:49 Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Base:** green PR #142 at `184f194`

## Current truth

The initial PR #143 scoped-adapter rewrite caused 33 unit failures and has been rolled back to the known green adapter baseline. Do not merge the migration branch in its current draft form. PR #142 remains the safe repair baseline.

## Why the migration failed

The rewrite changed more than ownership: it changed the composition protocol. Private adapter keys replaced public Track-ID context keys without preserving every `COMPOSING` marker and fallback path. That broke standalone output/input folds, mutual observation, diamond memoization, and lightweight test tracks. This was a design mismatch, not a flaky CI run.

## Required next sequence

1. Add characterization tests for the current green protocol before changing implementation.
2. Extract a scoped ownership interface behind `StandaloneObservationAdapter` without changing `compose`, `getEdges`, `getSources`, or lifecycle semantics.
3. Preserve public IDs at the API boundary and translate markers only inside the owner, with explicit tests for recursive cycles and cache reuse.
4. Migrate ProjectRuntime injection in one small commit.
5. Run full Node 24 CI after each slice. Keep the global fallback until the scoped path is proven equivalent.

## Guardrails

Keep PR #142 frozen and green. Do not merge PR #143 yet. Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off.
