# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 20:03 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Base branch:** `v5`  
**Base SHA:** `5f60c40852554b0992a1a4b00310b138cd212fa8`  
**Active PR:** none. Session closed after PR-10 merge and implementation review.  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75 CI bootstrap, PR #78 PR-01 baseline instrumentation, PR #79 PR-02 lifecycle ownership repair, PR #80 PR-03 graph transaction correctness, PR #81 PR-04 runtime scope boundary, PR #82 PR-05 patch and clock contracts, PR #83 PR-06 publisher path behind a flag, PR #84 PR-07 fixture shadow mode, PR #85 PR-08 live Spiral shadow, PR #86 PR-09 manual-trigger Motion compatibility, PR #87 PR-10 composite collapse and Motion-owned scheduling.
- **Active:** none.
- **Last passed checkpoint:** B, after PR-08. Checkpoint C remains gated on PR-11.
- **Current phase:** Phase 5, PR-10 complete, PR-11 not started.
- **Resume here:** create PR-11 as a narrow migration-adapter deletion PR from current `v5`, but first use `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md` to decide whether actual Spiral controller integration is needed before deletion.

## Verified state

- Existing group-host/composer path remains authoritative by default.
- Publisher/runtime path remains opt-in.
- Motion owns direct Track scheduling; TrackGroup remains as a compatibility bridge until PR-11.
- PR-10 merged with all seven CI checks green, including the disposal-race fix and child-unmount callback fix.
- Checkpoint B passed using committed Spiral-style live shadow evidence; actual React controller integration is still a review finding.
- No nested-GSAP spike result is committed; treat it as not run.

## Review report

- [Implementation review: PR-00 through PR-10](docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md)

## Verification protocol

1. Read this file and the implementation review for orientation only.
2. Confirm the active PR, head SHA, and checks against GitHub.
3. Update this file immediately whenever opening a PR, including branch, PR number, SHA, phase, checks, checkpoints, and resume point.
4. Merge only if all checks are green; if red, wait for logs before changing code.
5. Recreate the next PR cleanly from updated `v5`; do not stack on closed PR history.
6. Branch names must use `v5-pr-NN-*`, not a `v5/` prefix.
7. Update this file at session close with SHA, active PR/branch, checkpoints, spike evidence, flags, and resume point.

## Checkpoints

- **A, after PR-03:** passed.
- **B, after PR-08:** passed for committed Spiral-style shadow evidence.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Flag state

Publisher/runtime path remains opt-in. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded.
