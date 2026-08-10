# MotionPath v5 next implementor handoff

**Captured:** 2026-08-10 07:12 Asia/Jakarta  
**Branch:** `v5-break` from clean `v5` at `e4fc9b9`  
**Draft PR:** [#146](https://github.com/chahyasantoso/motionpath/pull/146)  
**Current phase:** Phase 0 baseline reconciliation
**Plan:** [`V5-HARD-BREAK-IMPLEMENTATION-PLAN.md`](./V5-HARD-BREAK-IMPLEMENTATION-PLAN.md)

## Handoff truth

The unit failure is understood. Ten suites are future-contract tests, and several files explicitly label themselves `PHASE 0 - RED BY DESIGN` or expected to fail until later phases. Their assertions remain untouched. `npm test` now maps to the Phase 0 baseline configuration; `npm run test:phase1-contract` runs the preserved target suites explicitly.

## Suites intentionally isolated

- `Track.observation.test.js`
- `Track.standalone-adapter.test.js`
- `Track.test.js`
- `Track.v43.test.js`
- `createTrack.standalone-adapter.test.js`
- `GraphBinding.initial-wiring.test.js`
- `GraphBinding.transaction.test.js`
- `GraphPublisher.contract.test.js`
- `GraphPublisher.incremental.test.js`
- `StandaloneObservationAdapter.test.js`

## Next implementor action

Run the Phase 0 matrix using `npm test`, not the future-contract command. Confirm the exact head is green. Then update all four docs with the results and begin Phase 1, where the isolated Track/adapter/GraphBinding suites become active gates.

## Do not drift

Do not delete, weaken, or rewrite the isolated assertions to manufacture green. Do not touch cross-motion, free-track, publisher rollout, or P2-04 topology/playback. The isolation is temporary and must be reversed as contracts become current.
