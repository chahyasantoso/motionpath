# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 17:16 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Last commit reviewed:** [`7d007a0`](https://github.com/chahyasantoso/motionpath/commit/7d007a00b43e0ac8ddbe9a64454888c75a460ef7)  
**Last commit message:** `Add phase to PR traceability map`

## Current position

- **Architecture:** accepted.
- **Implementation base:** `v5` exists and currently points to the last reviewed planning commit.
- **Active implementation PR:** none found on the branch list at status capture time.
- **Merged v5 implementation PRs:** none found; no `v5/pr-*` branches found.
- **Last passed checkpoint:** none. Checkpoint A is not passed until PR-03 completes.
- **Current implementation phase:** pre-PR-00, planning and CI bootstrap.
- **Resume here:** create `v5/pr-00-ci`, make the CI contract executable on `v5`, then open PR-01 only after the required checks pass on the unchanged base.

## Verified repository state

### CI

A workflow exists at `.github/workflows/ci.yml`, but it has not yet been updated for the accepted v5 delivery plan.

Present jobs:

- unit tests, Node 24;
- typecheck, Node 24;
- Vite production build, Node 24;
- package dry run;
- rig graph benchmark.

Current gaps relative to PR-00:

- `v5` is not included in the workflow push branches;
- pull requests targeting `v5` are not included;
- no non-mutating format-check command is wired;
- no boundary, consumer-fixture, deterministic-rerun, lifecycle, graph, runtime, scheduler, integration, or memory jobs are wired;
- the workflow invokes only scripts currently present in `package.json`.

### Runtime implementation

No v5 runtime implementation was found at status capture time for the planned symbols `GraphRuntime`, `MotionRuntime`, or `CompositeRuntime`. The repository still contains the existing group-host path, including `createGroupHost()` and its tests.

The accepted migration flags, publisher shadow path, explicit track-mode contract, ProjectRuntime, and cross-motion capability were not found as implemented v5 runtime features at status capture time.

### Nested scheduler spike

No committed nested-GSAP spike result was found. Treat the Phase 5/6 depth-three spike as **not run or not recorded**, not as passed.

### Checkpoints

- **A, after PR-03:** not passed.
- **B, after PR-08:** not passed.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Verification protocol for the next session

1. Read this file for orientation only.
2. Confirm the branch tip and active PRs against GitHub.
3. Confirm CI workflow triggers and job names from `.github/workflows/ci.yml`.
4. Search source for the relevant feature flags and runtime symbols before assuming any migration exists.
5. Run the checks required by the active PR and record results here.
6. Update this file in the closing commit with the new SHA, active PR/branch, checkpoint state, spike evidence, flag state, and exact resume point.

## Flag state

No accepted v5 migration flags were found implemented at status capture time. The default production path remains the existing composer/group-host path. This claim must be rechecked from source before every implementation session.

## Evidence policy

A planned feature is not a completed feature. A checkpoint is passed only when its PR is merged and its CI/exit evidence is recorded. A spike is passed only when its repro, environment, result, and artifact or test are committed. A status claim is orientation, not authority.
