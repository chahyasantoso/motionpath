# MotionPath v5 status

**Purpose:** living handoff for implementation state. This is not a plan and must be verified against source before continuing work.

**Status captured:** 2026-08-07 18:50 Asia/Jakarta  
**Branch reviewed:** `v5`  
**Base branch:** `v5`  
**Base SHA:** `5a9075964edd4af8cd0d57fe36ec87c1513dd621`  
**Active PR:** none. PR-03 has not been opened.  
**Closed stale PRs:** #76, #77

## Current position

- **Architecture:** accepted.
- **Merged:** PR #75 CI bootstrap, PR #78 clean PR-01 baseline instrumentation, PR #79 PR-02 lifecycle ownership repair.
- **Active:** none.
- **Last passed checkpoint:** none. Checkpoint A is not passed until PR-03 completes.
- **Current phase:** Phase 0, PR-02 complete, PR-03 not started.
- **Resume here:** create PR-03 graph transaction correctness from the current `v5` on a `v5-pr-03-*` branch. Scope is the transaction work only: defensive track-map copies, two-way graph/track set equality, atomic `addTrack`, `removeChild` routed through graph invalidation, replacement additions emitted, one canonical sorter, ignored retry configuration removed, and rollback tested at every failing edge index.

## Why PRs 76 and 77 were closed

They were stacked branches containing prior-base commits. After PR #75 merged, GitHub reported conflicts and duplicate checks. PR-01 was rebuilt cleanly as PR #78 and merged. The stale `v5-pr-02-lifecycle` branch carried no code, only a status-doc commit, so nothing was lost: PR-02 was written fresh on `v5-pr-02-lifecycle-clean` from the merged `v5` base.

## PR-01 merged changes

- `performance/v5-baseline.mjs` creates `docs/benchmarks/` before writing.
- `package.json` exposes `benchmark:v5:baseline`.
- CI uploads the baseline artifact and uses one PR-triggered workflow for `v5-*` implementation branches.
- No runtime behavior changed.

## PR-02 merged changes

- `Engine.#mountMotion` attaches the `GraphBinding` to the `Motion` that owns it. It was previously constructed and discarded, leaving the graph layer unreachable and undisposable.
- `GraphBinding` owns its `GraphPublisher` unless constructed with `ownsPublisher: false`, giving the graph layer one disposal entry point.
- `GraphBinding.destroy()` and `GraphPublisher.destroy()` are idempotent, release track references, and detach every lifecycle hook and cycle guard.
- A disposed publisher flushes nothing and publishes nothing. Deliberate mutation (`applyGraph`, `addTrack`, `addEdge`, `removeEdge`) throws; invalidation and `removeTrack()` stay inert, because those arrive from Track lifecycle events that can still be in flight during teardown.
- Failed mount disposes the graph layer whether or not the binding was reached.
- The publisher replaces its track map instead of clearing it, because it does not own the Map it is handed. Defensive copying is PR-03.
- `Motion.setGraphBinding()` disposes an outgoing binding, and disposes an incoming one rather than parking a live graph on a destroyed Motion.

## Verified state

- Existing group-host/composer path remains authoritative.
- No `GraphRuntime`, `MotionRuntime`, or `CompositeRuntime` implementation is present.
- No nested-GSAP spike result is committed; treat it as not run.
- No accepted v5 migration flags are implemented.
- `GraphPublisher.removeTrack()` is retained deliberately until the replacement destroy path is proven.
- The live cycle guard is installed on mount and removed only on disposal, covered by tests at both the publisher and Engine level.
- CI evidence for PR #79: all seven checks green on the head commit, one PR-triggered run, no duplicate push run.

## Known gaps, not yet in scope

- Repeated `Motion.init()` on an active Motion still destroys the initial track list and re-initializes empty. Characterized, not repaired here.
- Publisher track maps are still shared by reference with their binding. Defensive copying belongs to PR-03.

## Checkpoints

- **A, after PR-03:** not passed.
- **B, after PR-08:** not passed.
- **C, after PR-11:** not passed.
- **D, after PR-16:** not passed.
- **E, after PR-18:** not passed.
- **F, after PR-19:** not passed.

## Verification protocol

1. Read this file for orientation only.
2. Confirm against GitHub that `v5` is at the SHA above and that no v5 PR is open.
3. Create PR-03 cleanly from `v5`; do not stack on closed PR history.
4. Branch names must not use a `v5/` prefix: `refs/heads/v5` already exists and blocks nested refs. Use `v5-pr-NN-*`.
5. Before pushing, check whether a branch or PR for that PR number already exists. Two parallel sessions collided on PR-02 and the branch had to be reconciled by hand.
6. Update this file at session close with SHA, active PR/branch, checkpoints, spike evidence, flags, and resume point.

## Flag state

No v5 migration flags are implemented. Existing composer/group-host path remains default.

## Evidence policy

A planned feature is not completed feature. A checkpoint passes only when its PR is merged and CI/exit evidence is recorded. A spike passes only when its repro, environment, result, and artifact or test is committed.
