# MotionPath v5 status

**Status captured:** 2026-08-09 13:20 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Latest verified head:** `99e37de` (full Node 24 matrix green)  
**Integration head:** `44c3f7c` (CI re-run pending)  
**Safe frozen baseline:** PR #142 at `184f194`  
**Canonical index:** [`docs/V5-README.md`](./V5-README.md)  
**Implementation report:** [`V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md`](./V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md)  
**Next implementor handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

P2-03 adapter parity is **proven**. The full Node 24 matrix is green on `99e37de`
with one scenario runner driving both ownership modes across every locked
contract, checked mode against mode and both against locked literals.

On top of that, scoped ownership now has a **controlled runtime integration
path**: one explicit `observationOwnership` option on `Engine`, forwarded to the
`ProjectRuntime` it owns, reaching every standalone Track the library builds.
Default is unchanged. An engine that passes nothing is byte-for-byte the engine
that shipped before.

PR #143 stays draft until the matrix is re-run on the integration commits.

## What the parity gate caught

Two defects, both in **compatibility** ownership, neither visible before one
runner drove both owners:

1. `clearObserved` passed Track objects into an API that matches on private
   identity keys, so it removed nothing. Masked by `Track.setObserved(null)`,
   which clears edge by edge afterwards.
2. The module-global registry refcount counted `register()` calls instead of
   holders. Edge mutation re-registers its endpoints, so the count never reached
   zero, `unregister` never reached `#owner.unregister(key)`, and a source kept
   listing a destroyed observer for the life of the process.

The integration path then caught a third: `Engine.destroy()` rebuilt its
`ProjectRuntime` with constructor defaults, so a scoped engine silently became a
compatibility engine after any destroy. Ownership now survives the rebuild.

## Current state

| Layer | Ownership status |
|---|---|
| `ObservationState` / `TrackObservationOwner` | Shared by both owners, unchanged |
| `StandaloneObservationAdapter` | Production default, module globals intact |
| `ScopedObservationAdapter` | Full contract parity, opt-in |
| `ProjectRuntime` | One adapter per runtime, mode selected explicitly |
| `Engine` | Injects the runtime adapter into every standalone Track (F-02 closed) |
| `Track` | Still holds the compatibility reverse index, P2-03 deletion target |

Parity coverage: output folds, input folds, repeated mapper replacement and
repeated swaps, mutual cycles, diamond memoization, lightweight edges, destroy
snapshots, detach, duplicate public ids, shared compose contexts, `clearObserved`,
`unregister`, post-destroy reads, error paths, public adapter surface,
`ProjectRuntime` disposal, and the full `Engine` construction path.

## Next in line

Run the matrix on `44c3f7c`. Then the open decision is whether the default moves
to scoped, which requires deleting the module globals rather than flipping a
flag: the remaining compatibility hazards all live in that shared registry and
cannot be fixed inside the adapter. See the handoff.

## Guardrails

Do not merge scoped ownership based on green docs-only commits. Verify the latest
code head. When parity fails, fix the adapter: never relax a `LOCKED` entry, and
never assume the scoped side is the wrong one. Do not weaken readability or
boundary tests. Keep `publisherRendering`, `crossMotion`, and `freeTracks`
default-off, and keep `observationOwnership` defaulting to `compatibility`.
