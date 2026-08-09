# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-10 06:41 Asia/Jakarta  
**Active implementation:** Phase 0 complete, Phase 1 next  
**Branch:** `feat/pass2-track-facade-removal`  
**PR context:** [#145](https://github.com/chahyasantoso/motionpath/pull/145), evidence only

No row is complete from a stale head, partial run, or docs-only claim. Each phase closes with one exact-head verification matrix and an updated handoff.

| Phase / target | Status | Closure evidence or next proof |
| --- | --- | --- |
| Phase 0: clean baseline and evidence | **Closed** | Self-blocking readability allowlist and duplicate suites removed; plan, status, matrix, and handoff updated. Runtime and full CI gates remain required. |
| Phase 1: one graph authority | **Next** | Delete legacy facade and ownership modes; keep one long-lived ObservationState; remove bridge rebuilds; GraphBinding becomes sole mutation coordinator. |
| Qualified graph identity | Open | Canonical `motionId/trackId` and `~/trackId` normalization, ambiguity and cycle tests. |
| Project-wide GraphRuntime | Open | Two-motion shared graph, one publisher, one PatchRegistry, one clock subscription. |
| Authoritative patch publication | Open | ObservationState plus Track-local composition, immutable batches, no recursive graph walk through Track. |
| Motion composite / Track leaf | Open | Move topology and playback out of Track; migrate host API and demos. |
| Graph input validation | Open | Stable missing, unknown, duplicate, role-mismatch, and incompatible-source diagnostics. |
| Cross-motion and free-track membership | Blocked by prerequisites | Enable only after qualified IDs and project-wide runtime are proven. |
| Public API and type parity | Open | Remove runtime compatibility surface; update exports, declarations, docs, and examples. |
| Lifecycle and rollback | Open | Owner-first teardown, idempotent disposal, mapper-preserving rollback, bind/mutate/unbind regression. |
| Documentation handoff discipline | **Active** | Update status, matrix, handoff, and plan in every phase-closing commit with exact head and next action. |

## Phase 0 changes

- Removed `scripts/v5-readability-allowlist.mjs`.
- Removed `packages/core/src/code-style.test.js`.
- Removed `packages/core/src/readability-boundary.test.js`.
- Kept Prettier as the mechanical format gate.
- Kept architecture and GSAP boundary scans.
- Added the phase-closing documentation rule for future implementors.

## Rollout defaults still protected

| Flag | Current default | Removal phase |
| --- | --- | --- |
| `observationOwnership` | `compatibility` | Phase 1 |
| `publisherRendering` | off | Phase 2 |
| `crossMotion` | off | Phase 4 |
| `freeTracks` | off | Phase 4 |

## Required verification for every phase

```sh
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run format:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
npm run benchmark:rig
npm run benchmark:v5:baseline
```

The matrix closes only when all relevant results are green on the same final head and the docs are refreshed to that head.
