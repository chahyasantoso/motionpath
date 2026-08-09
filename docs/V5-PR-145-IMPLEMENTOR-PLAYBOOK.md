# PR #145 implementor playbook

**Purpose:** executable remediation plan for the senior review. This is the implementation contract, not a suggestion list.

**PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Current branch:** `feat/pass2-track-facade-removal`  
**Architecture slice:** P2-03 only

## Latest evidence

The latest Node 24 run reports **19 failing unit tests** and formatting failures in **172 files**. Treat these as one correctness gate, not cleanup noise. The failures cluster into readability drift, lifecycle regression, stale authored cycle expectations, adapter ownership/cleanup defects, and ObservationState composition or GraphBinding rollback fallout.

## Non-negotiable guardrails

Do not merge, close the draft, or declare P2-03 complete until every exit criterion below is green on one exact merge ref. Do not touch P2-04 topology/playback removal, publisher-rendering rollout, cross-motion behavior, free-track behavior, or rollout defaults. Do not weaken assertions, delete invariant comments, broaden allowlists, or mark a failing test obsolete without replacing its contract with an owner-level test.

## Ordered implementation

### Phase 0, freeze the evidence

Record the exact head, CI run, 19 failing test locations, and 172 formatting failures. Re-run focused suites before edits. If failures differ, stop and reconcile checkout or dependency state first.

### Phase 1, correctness and gates

1. Keep one authoritative PR matrix: pushes only for protected branches, pull requests for feature branches.
2. Fix unit failures by root cause, not by editing expectations: restore readability and invariant comments; preserve observer IDs on both destroy events; route authored cycles through GraphBinding/ObservationState; reject implicit cross-owner adoption; preserve adapter identity isolation and idempotent cleanup; preserve nested merge, input/output ordering, no-mapFn behavior, back-edge fallback, and mapper-preserving rollback.
3. Run Prettier over the full intended surface: root config, `packages/core/src`, `packages/react/src`, `scripts`, and `docs`. Inspect semantic diffs; formatting is not permission to compress code or delete comments.
4. Rerun focused suites and the full Node 24 matrix. Stop while unit or format is red.

### Phase 2, compatibility boundary

Make facade installation explicit. `createTrack` must not decorate authored Engine Tracks. Add runtime symbol-ban tests for direct Track, factory-created Track, Engine standalone, and Engine authored paths. Remove Track's direct dependency on the legacy facade by moving lifecycle event construction to a neutral module.

### Phase 3, ownership isolation

Remove implicit `_adoptObservationOwner` from ordinary mutation. Cross-owner edges must fail before mutation with unchanged source and observer scopes. If transfer is required, require detached state, snapshot, transfer atomically, and rollback on failure.

### Phase 4, authored ownership

GraphBinding and ObservationState must be the only authored owner. Consume or clear prior standalone state atomically. Unbinding must not reveal stale edges. GraphBinding addTrack, initial wiring, add, remove, and replace call only the controller. Fault-inject the controller or publisher, not compatibility overrides.

### Phase 5, lifecycle and transactions

Restore remove invalidation, destroyed `observerIds`, re-entrancy safety, repeated disposal idempotence, no stale publisher cache, mapper-preserving rollback, and bind/mutate/unbind regressions.

### Phase 6, honest modes and public API

Either keep compatibility and scoped implementations independent and prove parity, or collapse the fake two-mode rollout. Update TypeScript for every JS export and supported injected runtime option. Add a deterministic benchmark threshold separate from the fuzz timeout.

### Phase 7, final verification

```sh
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

Then verify one authoritative matrix, no duplicate workflow, no pending required checks, and exact-head docs.

## Commit slices

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

## Drift checks

Before every push, confirm: authored Tracks have no compatibility surface; no ordinary mutation re-homes Tracks; no stale owner can reappear after unbinding; lifecycle events preserve observer IDs and invalidation; ownership modes are genuinely independent or honestly collapsed; source formatting and runtime symbol-ban gates are real; P2-04 and rollout defaults are untouched.

## Sign-off

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
- Ownership parity decision:
- P2-04 untouched:
- Rollout defaults unchanged:
- Reviewer:
```

Any blank field means P2-03 is not complete.
