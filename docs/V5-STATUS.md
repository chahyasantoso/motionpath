# MotionPath v5 status

**Status captured:** 2026-08-08 10:35 Asia/Jakarta  
**Branch reviewed:** `v5`  
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
- PR-19b: the publisher sink. See `docs/V5-PR-19B-PUBLISHER-SINK.md`.

## PR-19 completion

Cross-motion reference registration rejects malformed IDs, qualified reference IDs, self-edges, unsupported roles, invalid input-role payloads, output-role inputs, and duplicate reference IDs before mutating committed state. Missing sources remain pending until explicit resolution on mount, source removal detaches dependents without silent reattachment, and free-track adoption remains separately capability-gated and off by default.

All PR-19 validation checks passed: unit tests, typecheck, format check, Vite production build, package dry run, runtime benchmark, and v5 baseline report.

## PR-19b completion

The production publish sink was a no-op. `Engine.#mountMotion` built `GraphPublisher` with `publish: () => {}`, and no `PatchRegistry`, `GraphRuntime` or clock existed in any mount path, so composed patches were cached and discarded and `flush()` was never called in production at all. The PR-16 merge gate was therefore unimplemented, not awaiting evidence.

PR-19b wires it end to end behind `Engine.publisherRendering`, strict `=== true`, off by default:

- Publisher-backed mounts build a `GraphRuntime` that publishes into a `PatchRegistry` and flushes once per clock tick. With the gate off the mount path is unchanged.
- The clock is attached only after `init()` and registration succeed, so no partial mount can flush.
- `GraphRuntime.start()` seeds one full invalidation, so the first tick publishes a complete snapshot and a renderer subscribing at mount has something to draw.
- Clock-driven flush failures record `GRAPH_FLUSH_FAILED` diagnostics instead of raising once per frame inside the GSAP ticker. A direct `flush()` still throws.
- `createTickClock` normalizes tick shape and multiplexes, so N motions add one ticker callback.
- `useMotionSubscribers` reads published patches when the motion is publisher-backed and falls back to the Track path otherwise.

Evidence: compose-once-per-node-per-tick including shared-ancestor dedup, and subscriber scaling flat at 1, 10 and 50 subscribers against a linear per-subscriber baseline, plus the Engine gate, ordering, and lifecycle suites.

## Next gate

PR-20 owns the remaining implementation-review finding #4: extract assembly use cases, make reload failure-atomic, simplify Engine to a lifecycle facade, update exports, hide internals, and add an exports map blocking deep imports. Keep it narrowly scoped to the API boundary. It also inherits the public-surface decision for `publisherRendering`, `Motion.subscribe/compose/getPatch` and `createTickClock`, which PR-19b deliberately left out of `docs/API-REFERENCE.md`.

Still open beyond PR-20: findings #6 and #7, both owned by PR-12/PR-13, and the measured optimization work in PR-21, which now has a real per-frame path to measure.

## Guardrails

- `crossMotion` and `freeTracks` stay disabled by default.
- `publisherRendering` stays disabled by default until the demos have measured evidence.
- Pending references never publish.
- Source removal never silently reattaches dependencies.
- Source sampling reads progress only and never controls another timeline.
- Canonical qualified ordering remains stable.
- No partial graph is exposed or flushed.
- No checkpoint is recorded as passed above an unimplemented prerequisite.

## Checkpoints

Checkpoints A through F are defined in `docs/V5-IMPLEMENTATION-PLAN.md` under "Checkpoints and rollback". That plan is the definition of record; this section reports status only and must not restate or invent scope.

| Checkpoint | Plan definition | Status |
| --- | --- | --- |
| A, PR-03 | lifecycle and graph mutations safe; old rendering authoritative | passed |
| B, PR-08 | actual Spiral path passes compatibility-composite shadow mode | passed with actual controller evidence |
| C, PR-11 | one permanent composite remains; migration adapter deleted | passed after PR #91 |
| D, PR-16 | same-motion publisher production-capable; project graph disabled | passed on PR-19b, pending its CI run. Publisher-backed rendering is implemented and gated; compose-once-per-tick and subscriber-scaling evidence committed. |
| E, PR-18 | ProjectRuntime mounts and rolls back atomically; cross-motion disabled | passed |
| F, PR-19 | cross-motion/free-track capability passes correctness and canary performance | passed |

The E and F qualifiers recorded in PR #109 are removed: both were independently met, and the D prerequisite they sat above is now implemented rather than merely relabelled.

A prior revision described D as "pending full PR-16 staged visibility evidence." That was wrong twice: staged visibility belongs to PR-18 and Checkpoint E, and the outstanding PR-16 item was implementation, not evidence.

## Branch naming note

`docs/V5-IMPLEMENTATION-PLAN.md` specifies branches such as `v5/pr-00-ci`. Git cannot hold `refs/heads/v5` and `refs/heads/v5/...` at the same time, so while `v5` exists as the implementation base no `v5/*` branch can be created. Use the flat form, `v5-pr-19b-publisher-sink`.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #2, #3 and #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #4 remains deferred to PR-20. Current statuses live in `docs/V5-REVIEW-FINDINGS-LOG.md`.
