# PR-23: ObservationGraph ownership

**Scope:** make normalized observation metadata the single renderer-neutral graph value object.  
**Branch:** `v5-pr-23-observation-graph`  
**Base:** `v5` after PR #114

## What changed

- `ObservationGraph` now builds immutable upstream, downstream, and edge-identity indexes once at normalization time.
- `downstreamOf`, `upstreamOf`, and `hasEdge` answer graph questions without touching live `Track` objects.
- Observation edge keys use a NUL delimiter. The old empty delimiter allowed field collisions and contradicted the original contract comment.
- `GraphBinding` remains the transactional mutation boundary. It validates a candidate through `ObservationGraph` before touching live wiring or publisher state.
- Standalone Tracks keep local observation behavior, including legal mutual observation and per-call cycle fallback. Graph-owned mutations continue to route through `GraphBinding` and publisher guards.

## Gate

The phase is not complete merely because the value object exists. Merge requires graph tests, GraphBinding transaction/lifecycle suites, standalone Track observation suites, and qualified-ID coverage to remain green. No renderer or cross-motion behavior changes here.
