# MotionPath v5 status

**Status captured:** 2026-08-08 09:23 Asia/Jakarta  
**Corrected:** 2026-08-08 10:05 Asia/Jakarta, checkpoint claims requalified against source  
**Branch reviewed:** `v5`  
**Merged commit:** `b9ffbda62e12326d6ebe93a11ebe8134cf17e895`  
**Next work:** PR-19b, wiring a real publisher sink, then PR-20 for implementation-review finding #4.

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

## PR-19 completion

Cross-motion reference registration now rejects malformed IDs, qualified reference IDs, self-edges, unsupported roles, invalid input-role payloads, output-role inputs, and duplicate reference IDs before mutating committed state. Missing sources remain pending until explicit resolution on mount, source removal detaches dependents without silent reattachment, and free-track adoption remains separately capability-gated and off by default.

All PR-19 validation checks passed: unit tests, typecheck, format check, Vite production build, package dry run, runtime benchmark, and v5 baseline report.

**Scope qualification:** every one of those guarantees is enforced at the validation, ordering, and reference-lifecycle layer. None of them is evidence that composed output reaches a renderer, because in the live mount path it does not. See "Publisher sink gap" below.

## Publisher sink gap

`Engine.#mountMotion` constructs the production publisher as:

```js
publisher = new GraphPublisher({ graph, tracks: trackMap, publish: () => {} });
```

`publish` is the delivery callback `GraphPublisher.flush()` invokes for every changed node. In the live mount path it is a no-op. Tracks compose, patches are cached, publish counts increment, and the output is discarded. No `PatchRegistry` and no `GraphRuntime` is constructed anywhere in `Engine`, so the React subscription path reads nothing the graph produces.

Consequences:

- The PR-16 merge gate, "same-motion rendering is publisher-backed," is **not met**. This is an unimplemented requirement, not missing evidence for an implemented one.
- The PR-16 CI requirements, compose-once-per-node-per-tick and subscriber-scaling evidence, have no corresponding committed suite.
- Implementation-review finding #2 is still fully open. The runtime boundary remains an addressable experimental surface, exactly as the 2026-08-07 review described it.

This is the second time a gap has been carried forward across merges rather than closed at its own gate; the first was `GraphBinding`. It is not carried forward again: PR-19b owns it.

## Next gate

**PR-19b** wires a real publish sink: construct a `PatchRegistry` in the mount path, route `GraphPublisher` output into it, expose the React subscription path, and add the compose-once-per-node-per-tick and subscriber-scaling suites PR-16 required. Keep the capability gates default-off and keep the old composition path authoritative until the sink is proven.

**PR-20** then owns the remaining implementation-review finding #4, exports and API boundary only. Keep it narrowly scoped. Do not let a rendering migration land inside an exports cleanup.

## Guardrails

- `crossMotion` and `freeTracks` stay disabled by default.
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
| D, PR-16 | same-motion publisher production-capable; project graph disabled | **not passed, re-scoped.** Validation, ordering, and patch contracts are complete and tested. The production-capable publisher half is unimplemented: the live sink is a no-op. Owned by PR-19b. |
| E, PR-18 | ProjectRuntime mounts and rolls back atomically; cross-motion disabled | passed for ProjectRuntime ownership, staged membership, and candidate rollback. Qualified: certified above the unmet D publisher path. |
| F, PR-19 | cross-motion/free-track capability passes correctness and canary performance | passed for capability gating, reference validation, and canary performance. Qualified: same dependency on D. |

A prior revision of this document described D as "pending full PR-16 staged visibility evidence." That was wrong twice: staged visibility belongs to PR-18 and Checkpoint E, and the outstanding PR-16 item is implementation, not evidence.

E and F are left as passed rather than revoked because their own merge gates were independently met and tested. The qualification is recorded so no future session reads either as proof that publisher-backed rendering works.

## Branch naming note

`docs/V5-IMPLEMENTATION-PLAN.md` specifies branches such as `v5/pr-00-ci`. Git cannot hold `refs/heads/v5` and `refs/heads/v5/...` at the same time, so while `v5` exists as the implementation base no `v5/*` branch can be created. Use the flat form, `v5-pr-19b-checkpoint-correction`.

## Review linkage

The original implementation review is `docs/V5-IMPLEMENTATION-REVIEW-2026-08-07.md`. Findings #1, #3, #5 are resolved; #7 is addressed incrementally by PRs #92 and #93; #2 is open and owned by PR-19b; #4 remains deferred to PR-20. Current statuses live in `docs/V5-REVIEW-FINDINGS-LOG.md`.
