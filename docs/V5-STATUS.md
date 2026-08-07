# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 17:48 Asia/Jakarta  
**Branch reviewed:** `v5-pr-01-baseline`  
**Base branch:** `v5`  
**Active PR:** [#76](https://github.com/chahyasantoso/motionpath/pull/76)  
**Stacked on:** [PR #75](https://github.com/chahyasantoso/motionpath/pull/75)  
**Latest fixes:** `7be898b` creates the baseline output directory; `7a176c6` removes duplicate push runs for implementation branches

## Current position

- **Architecture:** accepted.
- **Active implementation:** PR-01, baseline and observability.
- **Merged v5 implementation PRs:** none; PR-00 is the prerequisite CI bootstrap.
- **Last passed checkpoint:** none. Checkpoint A is not passed until PR-03 completes.
- **Resume here:** wait for the fresh PR-75/PR-76 checks; merge PR-75 first, then rebase/retarget PR-76 onto the updated `v5` and require the baseline artifact to pass.

## PR-01 diagnosis and fixes

The first baseline job failed because `docs/benchmarks/` did not exist in a clean GitHub Actions checkout. The runner now creates the destination directory before writing `v5-baseline.json`.

The repository workflow was also running on both implementation-branch pushes and pull requests, producing duplicate check sets and cancellation noise. Push triggers now cover the stable base branches and feature/fix/test branches, while `v5-*` implementation branches are validated through their pull requests targeting `v5`.

## Verified repository state

- The existing group-host path remains authoritative.
- No `GraphRuntime`, `MotionRuntime`, or `CompositeRuntime` implementation is present.
- No committed nested-GSAP spike result is present; treat it as not run or not recorded.
- No accepted v5 migration flags are implemented; old composer/group-host remains default.

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
4. Verify the baseline artifact exists and inspect its numbers.
5. Search source for relevant feature flags and runtime symbols before assuming any migration exists.
6. Run the checks required by the active PR and record results here.
7. Update this file in the closing commit with the new SHA, active PR/branch, checkpoint state, spike evidence, flag state, and exact resume point.

## Flag state

No accepted v5 migration flags were found implemented. The default production path remains the existing composer/group-host path.

## Evidence policy

A planned feature is not a completed feature. A checkpoint is passed only when its PR is merged and its CI/exit evidence is recorded. A spike is passed only when its repro, environment, result, and artifact or test are committed. A status claim is orientation, not authority.
