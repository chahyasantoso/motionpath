# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 18:03 Asia/Jakarta  
**Branch reviewed:** `v5-pr-01-baseline-clean`  
**Base branch:** `v5`  
**Active PR:** [#78](https://github.com/chahyasantoso/motionpath/pull/78)  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75, CI bootstrap.
- **Active:** PR #78, clean PR-01 baseline instrumentation.
- **Last passed checkpoint:** none. Checkpoint A is not passed until PR-03 completes.
- **Current phase:** Phase 0, PR-01.
- **Resume here:** verify PR #78 checks; merge it into `v5`; then create PR-02 lifecycle repair from the updated `v5` with only the binding-ownership change and its tests.

## Why PRs 76 and 77 were closed

They were stacked branches containing prior-base commits. After PR #75 merged, GitHub reported conflicts and duplicate checks. They are closed, not lost as design work: PR-01 was rebuilt cleanly as PR #78 from the merged `v5` base, and the PR-02 work remains recoverable from the old branch history if needed, but should be recreated cleanly after PR #78 merges.

## PR-01 clean changes

- `performance/v5-baseline.mjs` creates `docs/benchmarks/` before writing.
- `package.json` exposes `benchmark:v5:baseline`.
- CI uploads the baseline artifact and uses one PR-triggered workflow for `v5-*` implementation branches.
- No runtime behavior changed.

## Verified state

- Existing group-host/composer path remains authoritative.
- No `GraphRuntime`, `MotionRuntime`, or `CompositeRuntime` implementation is present.
- No nested-GSAP spike result is committed; treat it as not run.
- No accepted v5 migration flags are implemented.

## Checkpoints

- **A, after PR-03:** not passed.
- **B, after PR-08:** not passed.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Verification protocol

1. Read this file for orientation only.
2. Confirm PR #78 status and checks against GitHub.
3. Verify the baseline artifact and inspect its values.
4. Merge #78 before creating the next implementation branch.
5. Recreate PR-02 cleanly from updated `v5`; do not stack on closed PR history.
6. Update this file at session close with SHA, active PR/branch, checkpoints, spike evidence, flags, and resume point.

## Flag state

No v5 migration flags are implemented. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded. A spike passes only when its repro, environment, result, and artifact or test is committed.
