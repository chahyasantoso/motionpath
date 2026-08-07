# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 19:12 Asia/Jakarta  
**Branch reviewed:** `v5-pr-04-runtime-boundary`  
**Base branch:** `v5`  
**Base SHA:** `427fc7899a5c7bb7fb2fbeaaed9fcd57493666c5`  
**Active PR:** PR-04 pending creation  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75 CI bootstrap, PR #78 PR-01 baseline instrumentation, PR #79 PR-02 lifecycle ownership repair, PR #80 PR-03 graph transaction correctness.
- **Active:** PR-04 runtime scope boundary.
- **Last passed checkpoint:** A, after PR-03.
- **Current phase:** Phase 2, PR-04.
- **Resume here:** verify PR-04 checks; merge only if green; then create PR-05 patch and clock contracts from updated `v5`.

## PR-04 changes

- Added addressable `GraphRuntime` and `MotionRuntime` boundary with `register`, `unregister`, `replaceEdges`, `flush`, `start`, and `dispose`.
- Added deterministic `FakeClock` with one listener pass per tick.
- Added immutable renderer-neutral `PatchRegistry` envelopes with node id, revision, source progress, source revisions, values, and status.
- Runtime remains opt-in through `enabled`; existing recursive composer remains authoritative by default.
- Runtime disposal owns the binding, publisher, clock subscription, and patch boundary as one idempotent lifecycle.

## Verified state

- Existing group-host/composer path remains authoritative.
- No migration flag changes default rendering.
- No nested-GSAP spike result is committed; treat it as not run.
- Checkpoint A passed when PR-03 merged green.

## Verification protocol

1. Read this file for orientation only.
2. Confirm PR-04 status and checks against GitHub.
3. Merge PR-04 only if all checks are green.
4. Recreate PR-05 cleanly from updated `v5`; do not stack on closed PR history.
5. Branch names must use `v5-pr-NN-*`, not a `v5/` prefix.
6. Update this file at session close with SHA, active PR/branch, checkpoints, spike evidence, flags, and resume point.

## Checkpoints

- **A, after PR-03:** passed, PR-03 merged with all seven CI checks green.
- **B, after PR-08:** not passed.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Flag state

No v5 migration flags are implemented. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded. A spike passes only when its repro, environment, result, and artifact or test is committed.
