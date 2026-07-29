# MotionPath architecture and folder map

## v4.2 baseline

`v4.2` is the clean foundation branch. The package layout is authoritative: `packages/core` owns runtime/domain/usecases/validators/adapters/types/contract, `packages/react` owns hooks, and `apps/demo` owns routes/scenes/CSS.

The legacy `src` tree is now scheduled for deletion. No compatibility bridges are allowed in v4.2. The next cleanup PR must replace bridge files with real package implementations, update all imports and build entrypoints, then delete `src` runtime files while keeping only co-located tests and integration fixtures in their new owners.

## v4.2 feature direction

The next runtime feature is observation-graph normalization for FK and other mechanics. See `docs/V4.2-RIG-GRAPH-PLAN.md`.
