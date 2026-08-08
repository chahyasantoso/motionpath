# MotionPath v5 implementation plan, pass 2

**Status:** accepted plan revision, pass-2 revision A  
**Accepted:** 2026-08-08 Asia/Jakarta, by @chahyasantoso  
**Base:** `v5` after accepted PR-00 through PR-21 and supplemental PR-22/23  
**Canonical index:** [`V5-README.md`](./V5-README.md)  
**Control sheet:** [`V5-PASS-2-COMPLETION-MATRIX.md`](./V5-PASS-2-COMPLETION-MATRIX.md)

## Why a second pass exists

The accepted PR-00 through PR-21 plan delivered the staged migration and its measured gates. It did not finish every target-architecture boundary. Supplemental work then exposed three remaining seams: graph mutation still lives partly in `Track`, GSAP isolation is not proven by a blocking boundary audit, and graph value immutability is shallow by construction.

Pass 2 is therefore a **completion plan**, not a correction of the accepted plan. It must not be called PR-24 or silently added to the original checkpoint sequence.

## Completion definition

The refactor is complete when all of the following are true:

- `Track` is a leaf: no observation-edge ownership, child topology, group-host bridge, or playback bridge.
- `Motion` is the only recursive composite and owns scheduling, controls, and child slots.
- `ObservationGraph` and `GraphBinding` own graph metadata, mutation, indexes, cycle validation, rollback, and live wiring.
- Graph and patch values have a documented immutability contract that is enforced by tests.
- Core orchestration can run against fake ports without importing GSAP; GSAP, DOM, and browser clocks are adapters.
- Publisher rendering has an explicit production default and rollback switch, with old/new equivalence evidence before changing the default.
- Public exports, package contents, and deep-import boundaries match the ownership model.
- Reload, mount, unmount, failed mutation, repeated destroy, nested disposal, and source removal remain failure-atomic and leak-free.
- Cross-motion and free-track capabilities remain explicitly gated unless a separate product decision enables them.

## Pass-2 work packages

### P2-00: freeze the contract and evidence baseline

Create a machine-readable completion matrix mapping each target rule to source symbols, tests, and evidence. Add boundary scans for forbidden Track responsibilities, GSAP imports, public exports, and migration-only symbols. Record current package/build/test/benchmark results before structural changes.

**Gate:** every remaining claim has an owner, test location, and pass/fail criterion. No code ownership is moved in this package.

### P2-01: define immutable value boundaries

Define supported node, edge, diagnostic, patch, source-revision, and plugin-value shapes. Introduce one shared clone/freeze or immutable-value utility, document what is copied versus retained by reference, and add mutation-attempt tests in strict mode. Cover nested objects, arrays, maps/sets if supported, and custom plugin output.

**Gate:** a consumer cannot mutate a published graph or patch through any reachable nested value, or the unsupported shape fails clearly at the boundary.

### P2-02: isolate the clock and GSAP ports

Move `gsapTickerClock.js` into the GSAP adapter surface. Audit `Track`, `Motion`, trigger delegates, schema assembly, math helpers, and runtime imports. Separate production adapter imports from tests that intentionally use GSAP. Add a blocking source-boundary test that allows GSAP only under approved adapter paths and approved adapter tests.

**Gate:** core orchestration imports only `Interpolator`, `Scheduler`, and `Clock` ports; fake-backed core tests pass without loading GSAP; package exports expose supported adapters without leaking raw engine details.

### P2-03: move live observation ownership out of Track

Make `ObservationGraph` the normalized immutable model and `GraphBinding` the sole live mutation transaction boundary. Replace `Track.#observed`, `#observers`, graph guards, edge wiring, and observation composition with graph/runtime handles. Preserve standalone local composition through an explicit standalone adapter, not hidden Track state.

Implement prepare, validate, wire, commit, rollback, replace, source destroy, dependent removal, and explicit reattachment. Preserve legal standalone mutual observation only where the standalone contract permits it.

**Gate:** no Track observation state or observation mutator remains; graph/live wiring equivalence, cycles, duplicate edges, role/input validation, rollback, source removal, and repeated mutation suites are green.

### P2-04: finish the Track/Motion ownership split

Remove remaining Track-owned topology and playback bridge responsibilities. Track should expose sampling, interpolation, plugin composition, lifecycle, and a runtime handle only. Motion should own recursive child scheduling, offsets, controls, and disposal. Verify arbitrary-depth nesting, parent-relative timing, reflow, seek, reverse, destroy-without-remove, and repeated initialization.

**Gate:** a repository symbol-ban test proves Track cannot regain child/group-host APIs accidentally; nested Motion and Track lifecycle tests remain green.

### P2-05: make publisher rendering the authoritative path

Run publisher-backed rendering through the real demo/controller integration, compare it against the compatibility path, and define the rollout flag and rollback sequence. Promote the default only after visual/state-vector equivalence, subscriber scaling, failed mount, source removal, reload, and retained-object evidence pass.

This package does not automatically enable cross-motion or free-track behavior. Those remain separate product capabilities.

**Gate:** one compose per dirty node per clock tick, no half-flushed state, no retained runtime objects after disposal, and a documented rollback to the last known-good renderer.

### P2-06: final API, package, and migration cleanup

Remove obsolete compatibility adapters, stale graph-order fields, dead exports, and undocumented deep imports only after P2-03 through P2-05 pass. Update API reference, architecture docs, examples, package exports, and consumer fixtures. Keep internal entrypoints testable but unsupported.

**Gate:** public consumer fixture passes from the packed artifact; forbidden-import/export scans pass; no migration-only symbol remains outside historical docs.

### P2-07: final release verification

Run the full deterministic suite twice, typecheck, build, package dry run, lifecycle smoke, graph rollback suite, nested scheduler suite, real-controller integration, memory-retention smoke, benchmark suite, and default-flag audit. Publish a final evidence report with known limitations and rollback instructions.

**Gate:** all required checks green, no unowned finding, and the completion matrix says complete. Any remaining product decision is explicitly separated from architectural correctness.

## Ordering and rollback

Run P2-00 first. P2-01 and P2-02 can proceed independently after the baseline. P2-03 must precede P2-04, and both must pass before P2-05 changes the rendering default. P2-06 is deletion-only after the new path is authoritative. P2-07 is the release gate.

Every package should land as one focused change on `v5` or its immediately preceding pass-2 branch. Keep the narrowest kill switch enabled until the replacement mounts, validates, and completes its first successful flush. Never remove cycle protection, diagnostics, or the compatibility rollback path before parity evidence is committed.

## Explicit non-goals

- No automatic PR-24 naming or new top-level checkpoint is created.
- No silent change to cross-motion or free-track defaults.
- No broad rewrite of plugin behavior while ownership boundaries are being moved.
- No deletion of compatibility code before real-controller and lifecycle evidence passes.

## Plan acceptance record

This document is accepted as **pass-2 revision A**, effective 2026-08-08, on branch `v5`.

| Item | Decision |
|---|---|
| Scope | P2-00 through P2-07 exactly as written above. No renaming to PR-24 and no new top-level checkpoint. |
| Owner | @chahyasantoso owns every work package and the completion matrix until reassigned in writing here. |
| Entry condition | P2-00 must land before any other package. P2-01 and P2-02 unblock immediately after it. |
| Authority | The completion matrix is the control sheet. A package is complete only when its gate is green and the matrix row cites merged evidence. |
| Revision rule | Any change to scope, ordering, or gates requires a new revision letter recorded in this table, not an inline edit. |

Acceptance authorizes implementation of the packages above. It does not mark any package complete, does not change any default flag, and does not enable cross-motion or free-track behavior.
