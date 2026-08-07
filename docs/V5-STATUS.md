# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 17:20 Asia/Jakarta  
**Branch reviewed:** `v5-pr-00-ci`  
**Base branch:** `v5`  
**Active PR:** [#75](https://github.com/chahyasantoso/motionpath/pull/75)  
**Last implementation commit reviewed:** `b15790a` (`v5: add non-mutating format check`)

## Current position

- **Architecture:** accepted.
- **Implementation base:** `v5`.
- **Active implementation:** PR-00, CI bootstrap and repository contracts.
- **Merged v5 implementation PRs:** none.
- **Last passed checkpoint:** none. Checkpoint A is not passed until PR-03 completes.
- **Current implementation phase:** Phase 0, PR-00 in progress.
- **Resume here:** run and fix PR-00 CI, merge it into `v5`, then create PR-01 baseline and observability from the updated `v5`.

## PR-00 changes made

- Added `npm run format:check` using non-mutating Prettier execution.
- Added `npm run test:deterministic` as the deterministic test command contract.
- Added `v5` and `v5-*` push triggers plus `v5` pull-request targeting to `.github/workflows/ci.yml`.
- Kept the existing rig benchmark non-blocking during CI bootstrap.
- No runtime behavior was changed.

## Verified repository state

### CI

The workflow now has format check, unit tests, typecheck, Vite build, package dry run, and rig benchmark jobs. The workflow is wired for the v5 implementation branch. The broader graph, runtime, scheduler, integration, and memory jobs are intentionally deferred to their planned PRs.

### Runtime implementation

No v5 runtime implementation was found at status capture time for `GraphRuntime`, `MotionRuntime`, or `CompositeRuntime`. The existing group-host path remains authoritative.

### Nested scheduler spike

No committed nested-GSAP spike result was found. Treat the Phase 5/6 depth-three spike as not run or not recorded.

### Checkpoints

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

No accepted v5 migration flags were found implemented at status capture time. The default production path remains the existing composer/group-host path. This claim must be rechecked from source before every implementation session.

## Evidence policy

A planned feature is not a completed feature. A checkpoint is passed only when its PR is merged and its CI/exit evidence is recorded. A spike is passed only when its repro, environment, result, and artifact or test are committed. A status claim is orientation, not authority.
