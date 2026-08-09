# MotionPath v5: feasibility of a hard break

**Repo:** `chahyasantoso/motionpath`  
**Head studied:** `c955297`  
**Branch:** `feat/pass2-track-facade-removal`  
**Open PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Question:** what does it cost to drop backward compatibility entirely, and what is the best way to do it?

**Verdict: feasible, low risk, and worth doing now. The compatibility layer is not protecting users. It is protecting the test fixtures.**

## 1. The finding that decides this

`package.json` declares `"private": true`, version `1.0.0`, no `exports` map, and no publish script. MotionPath is not published. The only consumers of `packages/core` are `packages/react` and `apps/demo`, both in this repository.

So "compatibility" currently means: the v5 core stays bug-for-bug compatible with the v4 API so that the v4 tests keep passing. There is no third-party consumer and no deprecation window to honor. The blast radius of a hard break is exactly one repository, under single ownership.

Backward compatibility here is expensive insurance against a risk that does not exist.

## 2. What the drag costs

Commit history at this head: roughly 100 commits, all landed on 2026-08-09 between 08:40 and 12:55. Sampling the messages:

- ~35 are compatibility preservation: `preserve legacy observation reads outside Track`, `restore writable legacy hooks`, `preserve compatibility mutation hooks during state-first transactions`, `apply authored replacement state before compatibility projection`, `adopt observer and source into one legacy scope`.
- ~12 are readability-gate churn: `style: manually format Track readability surface`, `docs: restore Track invariant comments`, `test: defer readability floor until formatter is available`, then `test: restore readability floor gate` twenty minutes later.
- ~20 reconcile documents with other documents.

`docs/` holds 38 markdown files, 24 of them v5 planning artifacts, plus a README whose job is to say which status document is currently true. `V5-PR-145-IMPLEMENTOR-PLAYBOOK.md` is a seven-phase, ten-commit-slice plan with a twenty-field sign-off template, and it covers one slice (P2-03) of one pass (Pass 2) of one plan.

This is structural, not a discipline problem. Every change has to be correct twice, once for the new owner model and once for the legacy projection, and then a third artifact has to prove the two agree. That is why one fix spawns two.

## 3. Inventory of the compatibility surface

Eight distinct things. All deletable.

| # | Surface | Location | Shape |
|---|---|---|---|
| C1 | Legacy v4 observation API monkey-patched onto Track | `usecases/LegacyObservationFacade.js`, installed by `createTrack.js` | 4.5 KB of `Object.defineProperties` installing `setObserved`, `removeObserved`, `replaceObserved`, `observedSources`, `observedEdges`, `observerCount`, `observerIds` |
| C2 | Implicit owner re-homing | `Track._adoptObservationOwner`, called from the facade | Source of the cross-owner defects that Phase 3 of the playbook exists to fix |
| C3 | Two ownership modes | `Engine.js`: `OBSERVATION_OWNERSHIP_MODES`, `resolveObservationOwnership()` | ~30 lines plus a 12-line comment explaining why the mode must survive `destroy()`. The senior review calls this a "fake two-mode rollout" |
| C4 | Duplicate owner implementations | `StandaloneObservationAdapter` + `TrackObservationOwner` + `createObservationOwner` vs `ScopedObservationAdapter` | Two answers to one question |
| C5 | Shadow/parity scaffolding | `ObservationStateBridge.js` | 4.3 KB whose public value is `assertParity`, `assertGraphParity`, `assertCompositionParity`. Pure oracle, no product behavior |
| C6 | Rollout flags pinned off | `publisherRendering`, `crossMotion`, `freeTracks`, `observationOwnership` | `Engine.#mountMotion` branches into two different runtimes (`GraphRuntime` vs `GraphPublisher` + `GraphBinding`). Each flag doubles the state space every test must cover |
| C7 | Three cycle validators | `normalizeObservationGraph`, `ObservationState.#assertAcyclic`, `GraphPublisher.#graphGuard` | Recorded as F-07, still open |
| C8 | Legacy composite and playback bridge | `Engine.createMotionHost`, `Track._attachGroupHost` / `play` / `pause` / `seek` / `reverse` / `addChild` / `removeChild` | Deferred as P2-04, i.e. a second migration already scheduled |

Plus the tests that exist only to hold these together: `ObservationAdapter.scenario-parity.test.js` (17.8 KB), `ScopedObservationAdapter.parity.test.js`, `ObservationState.composition-parity.test.js`, `GraphBinding.observation-state-parity.test.js`, `ObservationStateBridge.test.js`, `Track.v43.test.js`, `Track.observation.test.js`, `Track.owner-first.test.js`, `createTrack.standalone-adapter.test.js`. Roughly 55 KB of test source whose subject is the seam, not the product.

Two tells worth naming:

- `Track.js` imports `createDestroyEvent` from `LegacyObservationFacade.js`. The leaf object of the new architecture has a hard import edge into the compatibility module.
- `scripts/v5-pass2-boundaries.mjs` strips comments before scanning, because the banned legacy symbol names appear in the explanatory comments that a different gate requires. The compatibility layer now generates work for the tools built to police it.

## 4. Feasibility

**Technical: high.** The target architecture is already written and accepted: Track as a leaf, Motion as the recursive composite, one project-scoped graph owner, immutable patches, adapter-isolated GSAP. The implementation largely exists already (`ObservationState`, `GraphBinding`, `GraphRuntime`, `ProjectRuntime`, `ScopedObservationAdapter`). What remains is not building v5, it is deleting v4.

**Consumer risk: near zero.** Private package, in-repo consumers only.

**Data risk: zero**, provided the authored project schema is left alone. See WP8.

**Real risk: exactly one.** Deleting the old path deletes the oracle. Today `assertCompositionParity` proves the new composition matches the old. Remove the old path and nothing can. WP0 mitigates this and is the one step that must not be skipped.

## 5. Recommended approach: delete-first on a burn branch

The current method is migrate-then-delete with parity proven at every step. That is correct when there are users. Without users it is strictly worse, because both implementations must stay alive and correct through every intermediate state.

Invert it. Delete first, let the suite go red, rebuild the tests against the new contracts. Accept a bounded red window on a branch. No partial merges.

### WP0: freeze the oracle, then freeze v4

_Half a day. Do not skip._

1. Tag current `master` as `v4.3-final` and push the tag. That tag becomes the entire compatibility story. Anyone needing old behavior checks out a git ref, not a runtime facade.
2. Before deleting anything, run `ObservationAdapter.scenario-parity.test.js` and the composition-parity suites with output recording, and dump the actual patch outputs to JSON fixtures. Convert those 17.8 KB of two-implementation comparisons into golden characterization fixtures. This is the one asset worth extracting from the compatibility layer: it turns "new must equal old" into "new must equal these recorded values", which survives the deletion of old.
3. Cut `v5-break` from the current head.

### WP1: remove the facade (C1, C2)

Delete `LegacyObservationFacade.js`. Remove `installLegacyObservationFacade` from `createTrack.js`, which becomes a plain `return new Track({...})`. Remove `_adoptObservationOwner` from `Track.js`. Move `createDestroyEvent` into a neutral `usecases/observationEvents.js` so Track no longer imports the compatibility module.

Effect: the P2-03 symbol ban passes by construction. The runtime symbol-ban tests, the widened strict scan (F-14), the comment-stripping in the boundary scanner, and the playbook's drift checks all become unnecessary rather than green.

### WP2: one owner, one mode (C3, C4)

Delete `observationOwnership`, `OBSERVATION_OWNERSHIP_MODES`, and `resolveObservationOwnership`. Keep `ScopedObservationAdapter`; delete `StandaloneObservationAdapter`, `TrackObservationOwner`, and `createObservationOwner`. The review's stated options are "prove parity or collapse the fake two-mode rollout". Collapse it.

### WP3: delete the bridge (C5)

Remove `ObservationStateBridge.js` and every `assert*Parity` call site. With one implementation there is nothing to be parity with. Also removes `#refreshObservationBridge` pressure from `GraphBinding`.

### WP4: burn the flags on (C6)

Set `publisherRendering` permanently on, then delete the flag and the `GraphPublisher` + `GraphBinding` branch of `Engine.#mountMotion`. `GraphRuntime` becomes the only path. Same for `crossMotion` and `freeTracks`: on, then gone. This is the largest single reduction in test surface in the plan, because it halves the state space every graph test must cover.

### WP5: one cycle validator (C7)

Keep `ObservationState.#assertAcyclic`. Delete `GraphPublisher.#graphGuard` and the validation inside `normalizeObservationGraph`.

### WP6: pull P2-04 into the same break (C8)

Strip `addChild`, `removeChild`, `_attachGroupHost`, `play`, `pause`, `seek`, and `reverse` from `Track`. Motion owns topology and playback. Replace `createMotionHost` with `createMotion({ trigger: { type: "manual", autoplay } })` as specified in the migration addendum, and skip the `CompositeRuntime` shim entirely: it was migration-only scaffolding for a migration no longer being run.

Keeping P2-03 and P2-04 separate is itself a compatibility-era constraint. Without compatibility, splitting them only buys a second full migration cycle.

### WP7: rebuild the tests

The long pole. Delete the parity suites outright. Rewrite Track tests against the owner contract. Rough split of the ~41 relevant test files: ~30% deleted, ~30% rewritten, ~40% untouched. The golden fixtures from WP0 carry behavioral coverage across the gap.

### WP8: do not break the schema

Keep the v4 project JSON (`contract/v4.js`, `parseV4Project`, `CURRENT_SCHEMA_VERSION`) exactly as is. Breaking the runtime API is free. Breaking the authored data format costs every demo and every fixture and buys no architectural clarity. Break code, keep data.

## 6. What to do with PR #145

Close it. It pays the full compatibility price to land a slice that WP1 deletes. Cherry-pick only the genuine defect fixes into `v5-break`:

- the `getSources` identity fix (private keys leaking where public Track objects are expected)
- the `#destroying` re-entrancy guard in `Track.destroy` (F-04)
- the `unsubscribe` / `unsubscribeDestroyed` mix-up in `GraphBinding.#subscribeTrack` (F-05)
- the shared-adapter-per-runtime fix (F-02)

Drop the rest. Roughly half of #145 is facade plumbing.

## 7. Two process changes

**Retire the exact-head parity ritual.** "One fresh exact-head matrix before any completion claim" exists because two implementations must be shown to agree. One implementation means one truth and one CI run. Keep the matrix, drop the ceremony.

**Retire the comment-ratio gate.** A 5% comment floor on `Track.js` produced `style: manually format Track readability surface`, then `docs: restore Track invariant comments`, then a documentation refresh about the comment restoration, inside fourteen minutes. It is also why the boundary scanner must strip comments before matching symbols. Let Prettier be the only formatter and delete the readability-ratio assertion. Keep the line-length check if it earns its place.

## 8. Cost comparison

| | Current trajectory | Hard break |
|---|---|---|
| Remaining scope | P2-03 sign-off (8 open gates), then P2-04, then Phases 3-8 of the addendum | WP0-WP8, one branch |
| Net code movement | Add facades, add parity tests, add status docs | Delete ~20 KB source, ~55 KB tests, ~15 planning docs |
| Correctness burden | Every change correct twice, plus proof they agree | Once |
| Realistic effort | Open-ended; four hours produced 100 commits and one unresolved readability failure | 2-3 focused days; tests are the long pole |
| Failure mode | Parity drift, doc drift, gates policing gates | A bounded red window on a throwaway branch |

## 9. Bottom line

This is a deprecation program with zero users. Tag `v4.3-final`, snapshot the parity scenarios as golden fixtures, cut `v5-break`, and delete C1 through C8 in one branch. The new architecture is already built; what is slow is the ceremony of proving it still behaves like the thing it replaces.

The only irreversible step is losing the parity oracle, and WP0 costs half a day and solves it. Everything after that is a `git rm`.
