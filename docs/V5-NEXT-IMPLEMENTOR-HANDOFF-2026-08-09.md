# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 15:00 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Last green head:** `c74601f`, 129 files and 712 tests green  
**Latest fix head:** `7f04915`, verification pending  
**Base:** green PR #142 at `184f194`

## Current truth

The large P2-03 projection cut is in place but the fix head still needs the matrix.
The failed run was useful and specific: Track had been rewritten into dense lines,
its comment ratio fell below the guard, and replacement events lost the old edge's
role when `opts.role` was omitted. `7f04915` restores readable formatting and derives
replacement roles/inputs from owner-state edges.

## What is now true

- ProjectRuntime is the only adapter construction owner.
- Process-global compatibility adapter state is gone.
- ObservationState owns graph state after construction hydration.
- GraphBinding injects the state-backed ObservationTrackController into authored Tracks.
- Track forwards observation mutation, composition, edge reads, observer IDs, clearing,
  and destroy cleanup through the owner facade; no local edge/reverse maps remain.
- Compatibility remains the default; scoped remains explicit opt-in.

## Required verification

Run in this order:

```text
npm run build
npm test -- --reporter=verbose
npm run typecheck
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
```

Expected focus: GraphBinding rollback/replacement, direct standalone Track parity,
source-destroy snapshots, and readability. If anything disagrees between owner modes,
assume compatibility is wrong until proven otherwise. Do not weaken assertions.

## Next slice after green

Migrate any remaining direct callers off Track compatibility names, then remove the
forwarding symbols from Track and make strict P2-03 boundary green. Keep child
 topology/playback removal separate as P2-04.

## Guardrails

Do not flip `publisherRendering`, `crossMotion`, `freeTracks`, or
`observationOwnership` defaults. Do not hide findings with boundary exceptions.
