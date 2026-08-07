# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 19:42 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Base branch:** `v5`  
**Base SHA:** `b8fe91841e5513921d32a8801bbf60bf1d4da57e`  
**Active PR:** none. PR-09 has not been opened.  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75 CI bootstrap, PR #78 PR-01 baseline instrumentation, PR #79 PR-02 lifecycle ownership repair, PR #80 PR-03 graph transaction correctness, PR #81 PR-04 runtime scope boundary, PR #82 PR-05 patch and clock contracts, PR #83 PR-06 publisher path behind a flag, PR #84 PR-07 fixture shadow mode, PR #85 PR-08 live Spiral shadow through temporary CompositeRuntime.
- **Active:** none.
- **Last passed checkpoint:** B, after PR-08. All seven CI checks passed and live Spiral-style shadow tests matched with zero unexplained mismatches.
- **Current phase:** Phase 4, PR-08 complete, PR-09 not started.
- **Resume here:** create PR-09 manual-trigger Motion compatibility from current `v5`. Add explicit `trigger.autoplay`, defaulting to current group-host behavior (`true`), while preserving seek, pause, reverse, remove, reflow, destroy, and repeated initialization.

## Verified state

- Existing group-host/composer path remains authoritative by default.
- Publisher/runtime path remains opt-in.
- Temporary CompositeRuntime exists only on merged history as migration evidence; no production default switched.
- No nested-GSAP spike result is committed; treat it as not run.

## Verification protocol

1. Read this file for orientation only.
2. Confirm the active PR, head SHA, and checks against GitHub.
3. Update this file immediately whenever opening a PR, including branch, PR number, SHA, phase, checks, checkpoints, and resume point.
4. Merge only if all checks are green; if red, wait for logs before changing code.
5. Recreate the next PR cleanly from updated `v5`; do not stack on closed PR history.
6. Branch names must use `v5-pr-NN-*`, not a `v5/` prefix.
7. Update this file at session close with SHA, active PR/branch, checkpoints, spike evidence, flags, and resume point.

## Checkpoints

- **A, after PR-03:** passed, PR-03 merged with all seven CI checks green.
- **B, after PR-08:** passed, PR-08 merged with all seven CI checks green and live Spiral shadow equivalence recorded.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Flag state

Publisher/runtime path remains opt-in. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded.
