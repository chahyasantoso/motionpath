# MotionPath v5 pass-2 implementation report

**Date:** 2026-08-09, Asia/Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Verified code head:** `99e37de`, full Node 24 matrix green  
**Integration head:** `44c3f7c`, CI re-run pending

## Session result

P2-03 standalone observation ownership has proven parity. One scenario runner
drives both the compatibility and scoped owners across every locked contract, and
scoped ownership is now reachable end to end through a single explicit option.
Compatibility remains the default. PR #142 remains the frozen green baseline.

## Delivered

- locked characterization tests for folds, public ids, cycles, memoization,
  replacement, duplicate ids, lightweight tracks, lifecycle snapshots, disposal;
- a scoped private-owner adapter with the full compatibility contract;
- one scenario runner across both owners, each result checked against the other
  owner and against a locked literal;
- `ProjectRuntime` ownership selector and disposal parity;
- an `Engine` ownership option that reaches production Track construction;
- integration coverage of the real construction path in both modes;
- current status, handoff, control sheet, and index documentation.

## What parity actually bought

Three defects, all in **compatibility** ownership, none of them reachable by
testing either adapter on its own:

1. `clearObserved` passed Track objects into an API that matches on private
   identity keys, so it removed nothing. Masked in production by
   `Track.setObserved(null)`, which clears edge by edge afterwards.
2. The module-global refcount counted `register()` calls rather than holders.
   Since every edge mutation re-registers its endpoints, the count never returned
   to zero, so `unregister` never released the owner entry and a source kept
   reporting a destroyed observer for the life of the process.
3. `Engine.destroy()` rebuilt its `ProjectRuntime` with constructor defaults, so a
   scoped engine silently reverted to compatibility ownership after any destroy.

Each one was found by comparing two implementations of the same contract, which is
the argument for keeping both owners alive until the globals are gone.

## Decision record

Separate behaviour from ownership. The compose protocol is the contract; ownership
is an implementation detail behind it. Scoped ownership may replace the registry
only behind that contract, with compatibility as the default until the globals
themselves are deleted. The default does not move by flipping a flag, because the
remaining hazards are properties of the shared registry rather than of the adapter.

## Next

Make `ProjectRuntime` the only constructor of a standalone adapter, then delete the
module globals, then delete the Track-side compatibility reverse index. Order and
rationale in [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md).

## Guardrails

Never fix a scoped test by weakening a locked assertion. Preserve public Track ids,
the `COMPOSING` fallback, mapFn semantics, lifecycle ordering, and default-off
rollout flags.
