# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 20:52 Asia/Jakarta  
**Branch reviewed:** `v5-pr-06-patch-immutability`  
**Base branch:** `v5`  
**Base SHA:** `e746716004a69931106a2c5a13a57caaf7b9d1b2`  
**Active PR:** #89, deep patch immutability, review finding #1.  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75 CI bootstrap, PR #78 PR-01 baseline instrumentation, PR #79 PR-02 lifecycle ownership repair, PR #80 PR-03 graph transaction correctness, PR #81 PR-04 runtime scope boundary, PR #82 PR-05 patch and clock contracts, PR #83 PR-06 publisher path behind a flag, PR #84 PR-07 fixture shadow mode, PR #85 PR-08 live Spiral shadow, PR #86 PR-09 manual-trigger Motion compatibility, PR #87 PR-10 composite collapse and Motion-owned scheduling, PR #88 PR-10 follow-up actual Spiral controller integration evidence.
- **Active:** PR #89 deep-freezes published patch values.
- **Last passed checkpoint:** B, after PR-08, now backed by actual controller evidence from PR #88. Checkpoint C remains gated on PR-11.
- **Current phase:** Phase 5, review follow-ups in progress, PR-11 not started.
- **Resume here:** land PR #89, then repair review finding #5, repeated active `Motion.init()`, which is the remaining gate on the PR-11 adapter deletion. Only then create PR-11 as a narrow deletion PR.

## Verified state

- Existing group-host/composer path remains authoritative by default.
- Publisher/runtime path remains opt-in.
- Motion owns direct Track scheduling; TrackGroup remains as a compatibility bridge until PR-11.
- PR #88 merged with all seven CI checks green. The actual React Spiral controller is mounted, driven by a deterministic clock, shadow-compared against publisher output, and verified to release Engine-owned instances on unmount.
- No nested-GSAP spike result is committed; treat it as not run.

## Review reports

- `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`: review of PR-00 through PR-10, correctness verdict, remaining gaps, optimization notes, and next-session recommendations.
- `docs/V5-REVIEW-FINDINGS-LOG.md`: living status of each review finding. Update it whenever a finding moves.

## Verification protocol

1. Read this file, the implementation review, and the findings log for orientation only.
2. Confirm the active PR, head SHA, and checks against GitHub.
3. Update this file immediately whenever opening a PR, including branch, PR number, SHA, phase, checks, checkpoints, and resume point.
4. Merge only if all checks are green; if red, wait for logs before changing code.
5. Recreate the next PR cleanly from updated `v5`; do not stack on closed PR history.
6. Branch names must use `v5-pr-NN-*`, not a `v5/` prefix.
7. Update this file at session close with SHA, active PR/branch, checkpoints, spike evidence, flags, and resume point.

## Checkpoints

- **A, after PR-03:** passed.
- **B, after PR-08:** passed, upgraded by PR #88 from Spiral-style evidence to the actual controller path.
- **C, after PR-11:** not passed. Blocked on review finding #5.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Flag state

Publisher/runtime path remains opt-in. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded.
