# Performance verification

Phase 12 tracks compile cost, frame-time composition, DOM writes per frame, and repeated mount/unmount cleanup.

The budget file is intentionally data-only so CI and browser runners can consume it without coupling the runtime to a benchmark framework.

Required scenarios:

- small, medium, and large project compilation
- one-frame composition with representative observation graphs
- DOM renderer dirty-write counts
- repeated mount/unmount cycles
- time, manual, and scroll browser smoke paths

## Rig graph benchmark

Run `npm run benchmark:rig` to measure the normalized graph and batched publisher across 14-track Walker-sized, 50-track, and 250-track chains. The command emits JSON with graph normalization time, composition time per frame, and published writes per frame so CI or a browser runner can compare results against `budgets.json`.
