# MotionPath v5 status

**Status captured:** 2026-08-07 21:56 Asia/Jakarta  
**Branch reviewed:** `v5-pr-15-observation-graph`  
**Base branch:** `v5`  
**Base SHA:** `bdde0053f70d28e0328d5c43b2303ce9c842b064`  
**Active PR:** #95, immutable ObservationGraph extraction.

## Current position

- PR #91 merged green: Checkpoint C passed.
- PR #92 merged green: GSAP adapter boundary landed.
- PR #93 merged green: recursive Motion scheduling landed.
- PR #94 merged green: explicit authored-graph input validation landed.
- Active PR #95 targets PR-15: ObservationGraph is now an explicit immutable value object; normalization remains the parser and validator.
- If CI is green, merge PR #95 and continue to PR-16 publisher-only same-motion runtime. If red, use supplied logs and fix the active branch.

## Open review findings

- #2 production GraphRuntime integration
- #4 public exports

## Checkpoints

- A passed
- B passed with actual controller evidence
- C passed after PR #91
- D not passed
- E not passed
- F not passed
