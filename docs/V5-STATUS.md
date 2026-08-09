# MotionPath v5 status

**Status captured:** 2026-08-09 18:40 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal` at `3a631a0a87279259c8c9a5c09836c68b20a6e409`  
**Active PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Senior review:** [`V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md)  
**Implementor playbook:** [`V5-PR-145-IMPLEMENTOR-PLAYBOOK.md`](./V5-PR-145-IMPLEMENTOR-PLAYBOOK.md)  
**Phase:** P2-03 facade-removal migration, blocked

## Executive status

PR #145 remains blocked. The senior review's remediation is now executable in [`V5-PR-145-IMPLEMENTOR-PLAYBOOK.md`](./V5-PR-145-IMPLEMENTOR-PLAYBOOK.md). The current branch has a fresh CI matrix in progress; do not treat queued or passing jobs as completion until every required job finishes on this exact head.

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
- [x] Strict boundary and benchmark jobs are blocking on the current branch.
- [ ] Current exact-head CI matrix fully green.
- [ ] One authoritative CI matrix per PR head.
- [ ] Production authored Tracks free of the legacy runtime facade.
- [ ] Cross-owner mutation rejects implicit ownership transfer.
- [ ] Binding/unbinding cannot resurrect stale owner state.
- [ ] Lifecycle and invalidation compatibility restored.
- [ ] Ownership rollout is behaviorally meaningful or removed.
- [ ] Public TypeScript surface matches JavaScript exports.
- [ ] Source formatting is a real CI gate.
- [ ] Final exact-head docs and sign-off completed.

## Next implementor

Follow the playbook in order. Keep P2-04 topology/playback and publisher rollout defaults out of this repair.
