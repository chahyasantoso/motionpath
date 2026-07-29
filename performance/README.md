# Performance verification

Phase 12 tracks compile cost, frame-time composition, DOM writes per frame, and repeated mount/unmount cleanup.

The budget file is intentionally data-only so CI and browser runners can consume it without coupling the runtime to a benchmark framework.

Required scenarios:

- small, medium, and large project compilation
- one-frame composition with representative observation graphs
- DOM renderer dirty-write counts
- repeated mount/unmount cycles
- time, manual, and scroll browser smoke paths
