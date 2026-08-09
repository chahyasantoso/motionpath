# PR #145 implementor playbook

**Purpose:** executable remediation plan for the senior review. This is the implementation contract, not a suggestion list.

**PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Reviewed baseline:** `ddcc3ffbc6c1d51d18755c90b56c880fe5c7d8e7`  
**Current branch at playbook update:** `3a631a0a87279259c8c9a5c09836c68b20a6e409`  
**Architecture slice:** P2-03 only

## 1. Non-negotiable guardrails

Do not merge, close the draft, or declare P2-03 complete until every exit criterion in this document is green on one exact merge ref.

Do not touch P2-04 topology/playback removal, publisher-rendering rollout, cross-motion behavior, free-track behavior, or rollout defaults. Do not weaken assertions, delete historical invariant comments, broaden allowlists, or mark a failing test obsolete without replacing its contract with an owner-level test.

The target ownership model is fixed:

- `Track` owns playhead state and local plugin composition only.
- Standalone observation is owned by one explicit caller/runtime scope.
- Authored observation is owned by `GraphBinding` and `ObservationState`.
- `GraphPublisher` schedules and publishes only. It does not infer graph meaning from Track objects.
- Compatibility APIs exist only at explicit compatibility boundaries.

## 2. Definition of done

P2-03 is done only when all of these are true:

1. The exact merge ref has one authoritative Node 24 CI matrix and every required job passes.
2. Engine-authored Tracks have no legacy observation methods or properties at runtime.
3. No edge mutation silently transfers a Track between owners or deletes edges in another scope.
4. Binding, mutation, destruction, and unbinding cannot resurrect stale standalone state.
5. Add, remove, replace, detach, destroy, and invalidation lifecycle contracts are preserved and tested.
6. Authored mutation has one owner and one cycle authority.
7. Compatibility and scoped modes are either genuinely independent with meaningful parity evidence, or the fake two-mode rollout is removed and documented as one mode.
8. JavaScript exports and TypeScript declarations match.
9. Source formatting is a real CI gate, separate from semantic readability checks.
10. Status, handoff, matrix, and this playbook all reference the same final head and same remaining work.

## 3. Work sequence, do not reorder

### Phase 0, establish the baseline

Before changing behavior:

- Record the current branch SHA and CI run URLs in the implementation notes.
- Reproduce the unit failure on Node 24. Capture failing test names, first stack frames, and whether each failure is a root defect or cascade.
- Confirm the workflow currently produces one or two matrices. Do not use a green duplicate job as evidence.
- Run the focused suites below before edits and save the baseline output.

```sh
node --version
npm ci
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
```

Focused first pass:

```sh
npx vitest run packages/core/src/engines/__tests__/Engine.observation-ownership.test.js packages/core/src/lib/__tests__/Track.observation.test.js packages/core/src/lib/__tests__/Track.owner-first.test.js packages/core/src/usecases/__tests__/ObservationAdapter.scenario-parity.test.js packages/core/src/usecases/__tests__/GraphBinding.state-authority.test.js packages/core/src/usecases/__tests__/GraphBinding.transaction.test.js packages/core/src/usecases/__tests__/GraphPublisher.disposal.test.js
```

**Stop condition:** if the baseline cannot be reproduced, investigate the ref, dependency lock, Node version, and CI checkout before changing code.

### Phase 1, fix gate integrity and correctness first

1. Make CI run one authoritative matrix per PR head. Pick one policy and document it: pull requests for feature branches, pushes for protected branches. Avoid a second equivalent run.
2. Expand `format:check:ci` to cover source, tests, scripts, and docs that Prettier owns. Keep generated/vendor exclusions explicit.
3. Reproduce and fix all unit failures without relaxing expectations. Add a short root-cause note for each failure.
4. Rerun the full matrix. Do not proceed while the unit gate is red.

**Exit evidence:** one matrix, unit green, format covers intended surfaces, no scanner or assertion was weakened.

### Phase 2, make compatibility installation explicit

Primary files: `packages/core/src/lib/createTrack.js`, `packages/core/src/lib/Track.js`, `packages/core/src/usecases/LegacyObservationFacade.js`, Engine construction paths, and compatibility fixtures.

1. Add an explicit `compatibility` option or separate legacy factory. The default Track factory must not decorate every Track.
2. Engine authored-graph construction must create a leaf Track with no legacy methods/properties.
3. Preserve compatibility behavior only for explicitly named legacy callers and fixtures.
4. Remove Track's import of `LegacyObservationFacade`; move destroy-event construction to a neutral lifecycle contract module or construct the event locally.
5. Add runtime symbol-ban tests for direct Track, `createTrack`, Engine standalone, and Engine authored paths. Define and test the explicit compatibility exemptions.
6. Keep the static source scanner. It is necessary, but runtime absence is the actual boundary.

**Required assertions:**

```js
expect(typeof authoredTrack.setObserved).toBe("undefined");
expect("observedEdges" in authoredTrack).toBe(false);
expect("observerIds" in authoredTrack).toBe(false);
```

Use the public owner/controller for authored graph tests, never a compatibility method.

### Phase 3, eliminate implicit ownership transfer

Primary files: `LegacyObservationFacade.js`, `Track.js`, both observation adapters, and scope tests.

1. Remove or disable `_adoptObservationOwner` from normal mutation.
2. A mutation involving Tracks from different owners must throw a descriptive error before any state changes.
3. If transfer is actually required, implement it as a separate explicit operation with these steps: verify detached/no live edges, snapshot owner state, detach from old owner, register in new owner, restore on failure, then emit lifecycle events.
4. Add tests where a source and observer already have incoming and outgoing edges in scope A, then a scope B mutation is attempted. Assert scope A is byte-for-byte unchanged after the throw.
5. Add duplicate public-ID tests across scopes and within one scope.

**Exit evidence:** no hidden unregister/re-register path remains in ordinary `setObserved`/`replaceObserved`.

### Phase 4, make GraphBinding the sole authored owner

Primary files: `GraphBinding.js`, `ObservationStateBridge.js`, `ObservationTrackController.js`, `Track.js`, and authored integration tests.

1. Define an ownership-transfer boundary for authored Tracks. Preferred model: Engine constructs authored Tracks with `observationAdapter: null`, and GraphBinding installs the controller before any edge exists.
2. For legacy-to-authored migration, consume and clear standalone owner state atomically. Do not retain a hidden adapter that becomes visible after unbinding.
3. On GraphBinding destruction, leave authored Tracks ownerless or transfer them to an explicitly supplied owner. Never reveal stale pre-binding state by merely clearing the controller.
4. Add the regression: bind with existing edges, mutate through binding, destroy/unbind, then assert old edges do not return and new edges do not disappear.
5. Make `GraphBinding.addTrack`, initial wiring, add, remove, and replace call only the controller/state. Remove the `hasMutationOverride` production branch from authored wiring.
6. Move fault injection to the controller or publisher boundary. Keep compatibility override tests in the compatibility suite.
7. Assert graph IR, ObservationState, publisher order, composition, mapper functions, and lifecycle events after both success and rollback.

**Exit evidence:** exactly one authored edge store is live at every point in the lifecycle.

### Phase 5, restore lifecycle and invalidation contracts

Primary files: `LegacyObservationFacade.js`, `Track.js`, adapters, publisher/binding tests.

1. `removeObserved` must snapshot matching edges, remove them, emit one `edge-removed` event per edge, then emit one `invalidated` event.
2. Preserve `observerIds` in the general `destroyed` lifecycle event as well as `onSourceDestroyed`, unless an intentional versioned API change is approved and documented.
3. Keep destroy re-entrancy safe. Set the destroying guard before callbacks can re-enter teardown.
4. Test repeated remove, replace, detach, destroy, and dispose. Assert no duplicate cleanup, no stale observer IDs, no post-disposal composition, and no stale publisher cache.
5. Add a publisher-facing test proving a removed edge cannot leave a cached composed contribution published.

**Exit evidence:** old observable lifecycle behavior is preserved or explicitly versioned, with consumers migrated.

### Phase 6, make ownership modes honest

Choose exactly one path:

**Path A, independent modes:** retain an independent compatibility implementation and a scoped implementation, then run parity against both different classes plus locked behavioral expectations, including lifecycle, duplicate IDs, context memoization, cycles, and disposal.

**Path B, one mode:** if compatibility is intentionally the same implementation, remove the fake `observationOwnership` rollout distinction, rename the API to reflect one owner model, and update docs/types/tests. Do not call alias-vs-alias tests parity evidence.

Do not leave the current alias with two labels.

### Phase 7, finish public API and performance hygiene

1. Update `packages/core/src/types/motionpath.d.ts` for `createObservationScope`, its returned scope/runtime contract, disposal, and any supported `projectRuntime` Engine option. If an option is internal, remove it from public-facing tests and docs.
2. Add a package type test that imports every new JS export from the declaration surface.
3. Preserve the ObservationState identity index, but add a deterministic benchmark threshold outside the 2,000-case correctness fuzz timeout.
4. Keep readability guards. Format the intended source surfaces instead of compressing code to satisfy line limits.

### Phase 8, final verification and documentation

Run the focused suites again, then the exact full gate:

```sh
npm ci
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run format:check:ci
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
npm run benchmark:rig
npm run benchmark:v5:baseline
```

Then inspect the final PR head and verify there is one matrix, no pending required checks, no duplicate workflow run, and no docs claiming work is complete without evidence.

## 4. Commit plan to reduce drift

Keep each corrective commit narrow and independently testable:

1. `ci: make one authoritative v5 matrix and format source surfaces`
2. `fix: resolve PR 145 Node 24 unit failures`
3. `refactor: make legacy facade installation explicit`
4. `fix: reject implicit cross-scope observation ownership changes`
5. `refactor: transfer authored observation ownership atomically`
6. `fix: restore observation lifecycle and invalidation contracts`
7. `test: make ownership parity evidence independent`
8. `types: publish observation scope contract`
9. `test: add runtime symbol and deterministic performance gates`
10. `docs: refresh exact-head status and closure evidence`

If a commit touches more than one phase, explain why in its message and update the checklist immediately.

## 5. Drift checks before every push

Ask these questions before pushing:

- Did any authored Track receive a compatibility method or property?
- Did any ordinary mutation unregister or re-home a Track?
- Are there two live owners for the same authored edges?
- Can unbinding reveal pre-binding state?
- Did remove/destroy emit the same lifecycle information as before?
- Are compatibility and scoped actually different implementations?
- Did the change alter P2-04, publisher rollout, cross-motion, free-track, or defaults?
- Does the diff contain compressed one-line production code or deleted invariant comments?
- Does TypeScript describe every new JavaScript export and supported option?
- Is this the one authoritative matrix for the exact head?

If any answer is wrong, stop and fix it before adding new architecture.

## 6. Final sign-off template

```md
## P2-03 sign-off

- Final head:
- One authoritative CI run:
- Unit tests:
- Typecheck:
- Build:
- Package:
- Format:
- Default boundary:
- Strict boundary:
- Rig benchmark:
- Baseline benchmark:
- Runtime symbol-ban:
- Cross-scope isolation:
- Bind/mutate/unbind:
- Lifecycle/invalidation:
- Ownership parity decision: independent modes / one mode
- P2-04 untouched: yes/no
- Rollout defaults unchanged: yes/no
- Reviewer:
```

Any blank field means P2-03 is not complete.
