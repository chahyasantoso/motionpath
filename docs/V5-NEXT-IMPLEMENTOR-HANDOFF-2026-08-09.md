# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 13:20 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Verified head:** `99e37de`, full Node 24 matrix green  
**Integration head:** `44c3f7c`, CI re-run pending  
**Base:** green PR #142 at `184f194`

## Current truth

P2-03 adapter parity is proven and green. Scoped ownership is reachable end to end
through one explicit option and is exercised by tests through the real `Engine`
construction path. Compatibility ownership is still the default and still the only
thing any existing caller gets.

## Completed

- PR #142 repair baseline frozen and preserved.
- Scoped private owner with the full compatibility adapter contract.
- One scenario runner across both ownership modes, every result checked twice:
  mode against mode, and both against locked literals.
- `ProjectRuntime` disposal parity and public adapter surface parity.
- Compatibility `clearObserved` fixed: it matched on Track objects where the
  owner matches on private identity keys, so it removed nothing.
- Compatibility refcount fixed: `globalRefs` counts holders, not `register()`
  calls, so the last holder's `unregister` actually tears the owner entry down.
- Compatibility lifecycle watching latched on `#watched`, matching scoped.
- **Controlled runtime integration path:** `Engine({ observationOwnership })`
  forwards to its `ProjectRuntime`, which already injects one adapter into every
  standalone Track it builds. F-02 is closed for the Engine path.
- Ownership mode survives `Engine.destroy()`, which rebuilds the runtime.
- Public type surface declares the option.

## Next slice: delete the module globals

The default cannot move by flipping a flag. Every remaining compatibility-only
hazard lives in the process-wide registry in `StandaloneObservationAdapter.js`,
and none of them is fixable inside the adapter:

1. **Cross-scope id resolution.** `#findTrack(id)` reads the global `tracksById`,
   so the first engine to register a public id wins for every engine. Two engines
   with a track called `root` resolve the same Track by string id. Scoped already
   resolves inside its own scope; there is a test asserting the scoped side.
2. **Two holders, half a teardown.** When two adapters hold one Track and one
   releases it, that adapter drops only the Track's outgoing edges, because the
   refcount is still above zero. Same shape as the bug just fixed, one level up.
3. **Unbounded lifetime.** Entries leave only on `Track.destroy()`, so anything
   O(registry) is unbounded and a suite that drops Tracks without destroying them
   grows it forever. This is why nothing reads `#owner.tracks`.

Suggested order:

1. Make `ProjectRuntime` the only place a standalone adapter is constructed.
   `createTrack` and the `Track` constructor still fall back to building their own
   when no adapter is injected, which is the last per-Track adapter path.
2. Point that construction at `ScopedObservationAdapter` and delete
   `StandaloneObservationAdapter`'s globals with it. Keep the class name if it
   reduces churn; the globals are the thing being removed, not the file.
3. Then, and only then, delete the Track-side compatibility reverse index named in
   [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md). It exists because
   independently constructed Tracks could hold different adapters, which stops
   being true after step 1.
4. Widen the boundary scan to strict once the symbols are gone.

## Do not do yet

Do not change the default ownership mode before step 1 above. Do not remove the
compatibility fallback while `createTrack` can still build its own adapter. Do not
flip `publisherRendering`, `crossMotion`, or `freeTracks` defaults. Do not relax a
`LOCKED` parity entry to make a run green, and do not assume the scoped side is
the wrong one when parity fails: it has been the correct side both times.

## Verification commands

```text
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
```

## Safe baseline

If the next slice regresses, reset to PR #142 / commit `184f194`, not to a
speculative adapter rewrite.
