# MotionPath v5 status

**Status captured:** 2026-08-09 18:34 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal` at `ddcc3ffbc6c1d51d18755c90b56c880fe5c7d8e7`  
**Active PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Senior review:** [`V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md)  
**Phase:** P2-03 facade-removal migration, blocked

## Executive status

PR #145 is not mergeable as P2-03 completion. The exact head ran two duplicate nine-job Node 24 matrices: both unit-test jobs failed and the other 16 jobs passed. The duplicate push and pull-request runs contradict the intended single authoritative matrix.

The direction remains sound: Track-local observation maps and GraphPublisher's Track-walking cycle guard are removed, ObservationState is the intended authored owner, and strict boundary plus benchmark jobs are blocking. The implementation still has merge-blocking ownership and compatibility gaps.

## Confirmed blockers

- `createTrack` installs `LegacyObservationFacade` unconditionally, including on Engine-authored graph Tracks.
- Legacy edge mutation can silently move a Track between adapters and delete live edges in its previous scope.
- GraphBinding can retain stale standalone owner state behind its controller; old edges may reappear after unbinding.
- `removeObserved` no longer emits edge-removal or invalidation lifecycle events.
- The destroyed lifecycle event no longer carries `observerIds`.
- `compatibility` and `scoped` ownership are aliases of the same adapter, making parity and rollback claims non-independent.
- GraphBinding late-track wiring can invoke a compatibility override and then mutate the controller again.
- `format:check:ci` checks only package and workflow files, not source.
- `createObservationScope` is exported in JavaScript without matching TypeScript declarations.

## Evidence-backed progress

- [x] Track-local observation maps and reverse registry removed.
- [x] GraphPublisher Track-walking cycle guard removed.
- [x] ObservationState/controller used for authored graph composition and mutation.
- [x] Strict boundary and benchmark jobs are blocking and green on the reviewed head.
- [x] Build, typecheck, package dry run, default boundary, strict boundary, and benchmarks pass.
- [ ] Full unit suite green on the exact head.
- [ ] One authoritative CI matrix per PR head.
- [ ] Production authored Tracks free of the legacy runtime facade.
- [ ] Cross-owner mutation rejects implicit ownership transfer.
- [ ] Binding/unbinding cannot resurrect stale owner state.
- [ ] Lifecycle and invalidation compatibility restored.
- [ ] Ownership rollout is behaviorally meaningful or removed.
- [ ] Public TypeScript surface matches JavaScript exports.
- [ ] Source formatting is a real CI gate.

## Next implementor

Follow [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md) in order. Keep P2-04 topology/playback and publisher rollout defaults out of this repair.
