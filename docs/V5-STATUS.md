# MotionPath v5 status

**Status captured:** 2026-08-08 10:40 Asia/Jakarta  
**Branch reviewed:** `v5` plus PR-20 API-boundary work  
**Next work:** PR-20, implementation-review finding #4.

## Current position

- PR #91 through PR #96 merged green: graph/runtime foundations landed.
- PR #97 through PR #101 merged green: qualified IDs, staged ProjectRuntime ownership, membership, and lookup assembly landed.
- PR #102 merged green: explicit capability gates and canonical qualified ordering.
- PR #103 merged green: pending references and explicit resolution.
- PR #104 merged green: source-unmount diagnostics and dependent-reference removal.
- PR #105 merged green: current-progress sampling without timeline control.
- PR #106 merged green: combined reference lifecycle with explicit reattachment.
- PR #107 merged green: gated `~/trackId` free-track adoption.
- PR #108 merged green: cross-motion reference validation before mutation.
- PR #109 merged: checkpoint correction, docs only.
- PR #110 merged green: publisher sink, clock delivery, React patch subscription, and PR-16 evidence.
- PR-20 is in progress on `v5-pr-20-api-boundary`.

## PR-19b completion

PR #110 passed all seven checks: unit tests, typecheck, format check, Vite production build, package dry run, rig benchmark, and v5 baseline report. It wires the publisher path behind strict `Engine.publisherRendering === true`, keeps it off by default, starts clocks only after mount commit, records clock-driven failures as bounded diagnostics, multiplexes ticker delivery, and routes React subscribers to immutable published patches.

Checkpoint D is passed. Finding #2 is resolved. E and F remain passed without qualifiers.

## PR-20 in progress

PR-20 owns implementation-review finding #4: public exports expose migration internals. The current branch replaces wildcard deep exports with an allow-list, exports `Engine` from the supported root, moves runtime/graph classes behind an explicit internal entrypoint, updates the API reference, and adds a boundary regression test. The publisher gate and its default-off behavior remain unchanged.

The remaining PR-20 gate is green validation plus the final decision on whether reload assembly needs another extraction pass. Do not merge a red boundary or consumer-fixture check just because the runtime tests pass.

## Guardrails

- `crossMotion`, `freeTracks`, and `publisherRendering` stay disabled by default.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Source sampling reads progress only and never controls another timeline.
- Canonical qualified ordering remains stable.
- No partial graph is exposed or flushed.
- No checkpoint is recorded as passed above an unimplemented prerequisite.

## Checkpoints

Checkpoints A through F are defined in `docs/V5-IMPLEMENTATION-PLAN.md` under "Checkpoints and rollback". That plan is the definition of record; this section reports status only.

| Checkpoint | Plan definition | Status |
| --- | --- | --- |
| A, PR-03 | lifecycle and graph mutations safe; old rendering authoritative | passed |
| B, PR-08 | actual Spiral path passes compatibility-composite shadow mode | passed with actual controller evidence |
| C, PR-11 | one permanent composite remains; migration adapter deleted | passed after PR #91 |
| D, PR-16 | same-motion publisher production-capable; project graph disabled | passed on green PR #110 |
| E, PR-18 | ProjectRuntime mounts and rolls back atomically; cross-motion disabled | passed |
| F, PR-19 | cross-motion/free-track capability passes correctness and canary performance | passed |

## Branch naming note

`docs/V5-IMPLEMENTATION-PLAN.md` specifies branches such as `v5/pr-00-ci`. Git cannot hold `refs/heads/v5` and `refs/heads/v5/...` at the same time, so while `v5` exists as the implementation base no `v5/*` branch can be created. Use flat branch names such as `v5-pr-20-api-boundary`.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #2, #3 and #5 are resolved; #4 is owned by PR-20; #7 is addressed incrementally by PRs #92 and #93; #6 remains owned by PR-12/PR-13. Current statuses live in `docs/V5-REVIEW-FINDINGS-LOG.md`.
