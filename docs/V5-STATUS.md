# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 19:50 Asia/Jakarta  
**Branch reviewed:** `v5-pr-10-motion-composite`  
**Base branch:** `v5`  
**Base SHA:** `b44864c0769a91815adcac1e8d30d92e799dbb9d`  
**Head SHA:** `ae78404ac3a9ae2629f38d32317b0329d65cb456`  
**Active PR:** [#87](https://github.com/chahyasantoso/motionpath/pull/87)  
**Checks:** pending after status update; merge only after all seven checks are green.  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75 CI bootstrap, PR #78 PR-01 baseline instrumentation, PR #79 PR-02 lifecycle ownership repair, PR #80 PR-03 graph transaction correctness, PR #81 PR-04 runtime scope boundary, PR #82 PR-05 patch and clock contracts, PR #83 PR-06 publisher path behind a flag, PR #84 PR-07 fixture shadow mode, PR #85 PR-08 live Spiral shadow, PR #86 PR-09 manual-trigger Motion compatibility.
- **Active:** PR #87, PR-10 composite collapse and Motion-owned scheduling.
- **Last passed checkpoint:** B, after PR-08.
- **Current phase:** Phase 5, PR-10.
- **Resume here:** verify PR #87 checks; merge only if green; then create PR-11 migration adapter deletion from updated `v5`.

## PR-10 changes

- Motion now owns the permanent scheduler maps and child slots directly.
- Track child mounting routes through Motion's scheduler callbacks.
- Dynamic spawn, removal, reflow, repeated initialization, and disposal are covered.
- TrackGroup remains only as a compatibility bridge until PR-11 deletes the migration surface.

## Verified state

- Existing group-host/composer path remains authoritative by default.
- Publisher/runtime path remains opt-in.
- Checkpoint B passed with PR-08 merged green.
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

- **A, after PR-03:** passed.
- **B, after PR-08:** passed.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Flag state

Publisher/runtime path remains opt-in. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded.
