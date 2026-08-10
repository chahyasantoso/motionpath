# MotionPath v5 architecture refactor plan

**Status:** accepted target architecture, with current-state reconciliation  
**Implementation base:** `v5`  
**Canonical index:** [`V5-README.md`](./V5-README.md)

## Current interpretation

The target architecture and ownership rules below remain accepted. The accepted implementation sequence ends at PR-21. PR-22 and PR-23 are supplemental follow-ups, not new architecture checkpoints.

The accepted target is: `Track` as a leaf, `Motion` as the permanent recursive composite, one project-scoped graph owner, renderer-neutral immutable patches, explicit transaction boundaries, adapter-isolated GSAP, and capability-gated cross-motion/free-track behavior.

## Current deviations requiring attention

- ObservationGraph now owns normalized metadata, adjacency indexes, and collision-proof edge identity, but live mutation still remains behind `GraphBinding` and standalone `Track` behavior. Do not claim full Track extraction yet.
- The graph objects freeze containers and direct records; deep immutability of nested user-owned values still needs an explicit contract and tests.
- The architecture requires no GSAP imports outside adapters. Current repository searches still find direct imports in core-adjacent runtime/test paths, so the import-boundary result needs an explicit audit rather than a broad “done” claim.
- Conservative defaults remain mandatory: `crossMotion`, `freeTracks`, and `publisherRendering` stay disabled by default.

## Accepted ownership rules

`Engine` owns project lifecycle and one `ProjectRuntime`; `ProjectRuntime` owns graph membership, publisher, clock, and qualified IDs; `Motion` owns recursive scheduling and child slots; `Track` owns only interpolation/plugin composition; `ObservationGraph` owns graph metadata, edges, validation, cycle checks, and order; adapters own GSAP, DOM, React, clocks, and browser capabilities.

## Evidence policy

Use [`V5-STATUS.md`](./V5-STATUS.md) for current implementation status and [`V5-REVIEW-FINDINGS-LOG.md`](./V5-REVIEW-FINDINGS-LOG.md) for findings. Historical reviews do not override those documents. Any remaining extraction or contract-hardening work requires a named plan revision before it becomes a new checkpoint.
