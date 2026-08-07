# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 19:26 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Base branch:** `v5`  
**Base SHA:** `975fe6dbf33faeb06efc70aa9e5732657701d174`  
**Active PR:** none. PR-07 has not been opened.  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75 CI bootstrap, PR #78 PR-01 baseline instrumentation, PR #79 PR-02 lifecycle ownership repair, PR #80 PR-03 graph transaction correctness, PR #81 PR-04 runtime scope boundary, PR #82 PR-05 patch and clock contracts, PR #83 PR-06 publisher path behind a flag.
- **Active:** none.
- **Last passed checkpoint:** A, after PR-03. Checkpoint B remains gated on PR-08.
- **Current phase:** Phase 3, PR-06 complete, PR-07 not started.
- **Resume here:** create PR-07 fixture shadow mode from current `v5`, update this file when the PR opens, then verify its checks before deciding whether to merge.

## PR-06 changes

- Added `GraphRuntime.usePublisher`, `getPatch`, `subscribe`, and `compose` contracts.
- Kept the existing recursive composer as the default when `enabled: false`.
- Preserved the one-argument compose callback contract.
- Exposed immutable patch envelopes through the enabled subscription path.
- Disposal rejects new subscriptions and stops publication.

## Verified state

- Existing group-host/composer path remains authoritative by default.
- Publisher path is opt-in; no default rendering migration has occurred.
- PR-05 established deterministic revisions, source progress/revision metadata, one flush per clock tick, and batch-wide subscriber snapshots.
- PR-03 graph transaction correctness remains merged and Checkpoint A is passed.
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
- **B, after PR-08:** not passed.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Flag state

Publisher/runtime path remains opt-in. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded. A spike passes only when its repro, environment, result, and artifact or test is committed.
