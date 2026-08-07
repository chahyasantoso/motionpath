# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 17:26 Asia/Jakarta  
**Branch reviewed:** `v5-pr-00-ci`  
**Base branch:** `v5`  
**Active PR:** [#75](https://github.com/chahyasantoso/motionpath/pull/75)  
**Latest implementation commits:** `1c34e2f` manifest correction, `5b09ade` scoped CI format gate

## Current position

- **Architecture:** accepted.
- **Active implementation:** PR-00, CI bootstrap and repository contracts.
- **Merged v5 implementation PRs:** none.
- **Last passed checkpoint:** none. Checkpoint A is not passed until PR-03 completes.
- **Current implementation phase:** Phase 0, PR-00 in progress.
- **Resume here:** wait for the new CI run; merge PR-00 only after all required checks pass, then create PR-01 baseline and observability.

## PR-00 changes and CI diagnosis

The first CI run showed **12 check runs**, but that is two workflow runs with the same six jobs, likely from both the branch push and pull-request events. There are **6 unique jobs**, not 12 planned checks.

The only failing unique job was format check. It scanned the whole existing repository and found 104 pre-existing files needing formatting. Unit tests, typecheck, build, package dry run, and benchmark passed.

Fix applied: PR-00 now uses `format:check:ci`, a non-mutating check scoped to the files owned by this CI bootstrap PR. The full-repository `format:check` remains available for the later formatting/boundary work instead of turning PR-00 into a 104-file cleanup.

## Verified repository state

- No v5 runtime implementation was found for `GraphRuntime`, `MotionRuntime`, or `CompositeRuntime`.
- The existing group-host path remains authoritative.
- No committed nested-GSAP spike result was found; treat it as not run or not recorded.
- No accepted v5 migration flags were found implemented; the old composer/group-host path remains default.

## Checkpoints

- **A, after PR-03:** not passed.
- **B, after PR-08:** not passed.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Verification protocol for the next session

1. Read this file for orientation only.
2. Confirm the branch tip, PR status, and CI checks against GitHub.
3. Confirm workflow triggers and job names from `.github/workflows/ci.yml`.
4. Search source for relevant feature flags and runtime symbols before assuming any migration exists.
5. Run the checks required by the active PR and record results here.
6. Update this file in the closing commit with the new SHA, active PR/branch, checkpoint state, spike evidence, flag state, and exact resume point.

## Flag state

No accepted v5 migration flags were found implemented at status capture time. The default production path remains the existing composer/group-host path.

## Evidence policy

A planned feature is not a completed feature. A checkpoint is passed only when its PR is merged and its CI/exit evidence is recorded. A spike is passed only when its repro, environment, result, and artifact or test are committed. A status claim is orientation, not authority.
