# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 19:55 Asia/Jakarta  
**Active implementation:** [PR #145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

No row is complete from a stale head, partial run, skipped test, or docs-only claim.

| Target rule | Status | Closure evidence |
|---|---|---|
| Standalone adapter scope | Partial | Explicit target-scope adoption works; cross-owner rejection still required |
| Standalone ownership parity | Unproven | Independent implementations or an honest one-mode decision |
| Track is a leaf | Partial | Static seams removed; runtime authored facade test still required |
| ObservationState owns authored state | Partial | Owner-first mutation is in place; bind/unbind resurrection test remains |
| Cycle authority | Partial | Publisher guard removed; final owner-based cycle run required |
| Lifecycle and rollback | Partial | Observer IDs and rollback paths restored; final repeated teardown evidence required |
| Runtime symbol ban | Open | Test direct, factory, Engine standalone, and Engine authored surfaces |
| Public API/type parity | Open | Declare `createObservationScope` and supported runtime options |
| Readability | Partial | Track and scoped adapter manually reformatted; final 720-test run required |
| Gates are real | Partial | Format job removed by decision; unit, build, strict boundary, and benchmarks must pass on one exact head |
| Graph/patch immutability | Closed for this pass | Existing evidence |
| GSAP isolation | Separate | P2-02/P2-05 |
| Publisher rollout | Separate | Keep rendering default-off |

## Rollout defaults

| Flag | Default |
|---|---|
| `observationOwnership` | `compatibility` |
| `publisherRendering` | off |
| `crossMotion` | off |
| `freeTracks` | off |

## Final verification command set

```sh
npm test -- --reporter=verbose
npm run typecheck
npm run build
npm run pack:check
npm run boundary:v5:pass2
npm run boundary:v5:pass2:strict
npm run benchmark:rig
npm run benchmark:v5:baseline
```

The matrix closes only after all results are green on the same final head and the docs are refreshed to that head.
