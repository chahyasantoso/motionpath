# MotionPath v5 pass-2 boundary audit

**Work packages:** P2-00 (baseline), P2-02 (GSAP boundary)  
**Captured:** 2026-08-08 Asia/Jakarta  
**Updated:** 2026-08-09 07:16 Asia/Jakarta, closing review findings F-12, F-14, F-16  
**Plan:** [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md), pass-2 revision A  
**Review:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md), status in [`V5-PASS-2-REVIEW-STATUS.md`](./V5-PASS-2-REVIEW-STATUS.md)

## Commands

```text
npm ci
npm run format:check
npm test
npm run typecheck
npm run build
npm run pack:check
npm run benchmark:v5:baseline
npm run benchmark:rig
npm run boundary:v5:pass2
```

Strict mode is the completion gate, available as a script now:

```text
npm run boundary:v5:pass2:strict
```

## What automation actually runs

| Check | In CI? | Notes |
|---|---|---|
| GSAP import boundary | **Yes, blocking** | `packages/core/src/gsap-boundary.test.js` under `npm test` |
| Readability boundary | **Yes, blocking** | `packages/core/src/readability-boundary.test.js`, protected-file list that may only grow (F-11) |
| `boundary:v5:pass2` | **Yes, blocking** | `boundary-scan` job, added for F-12. Fails on new core violations and stale quarantine entries |
| `boundary:v5:pass2:strict` | Not yet | Becomes the gate when P2-03 removal lands |
| `format:check` on all source | **No** | CI runs `format:check:ci`, two files only. A repo-wide prettier job fails today, see below |
| Benchmarks | Yes, non-blocking | Both `continue-on-error: true`, no regression thresholds (F-13) |

### Why prettier is not repo-wide yet

About a dozen source files are currently dense single-line members, including
`GraphBinding.js`, `ObservationState.js` and `ProjectRuntime.js`, so switching CI
to `format:check` would fail on contact. The formatting sweep is its own slice.
Until then the readability gate protects the files that have been formatted, and
that list may only grow.

## Enforcement model

P2-00 shipped the scan in pure audit mode: it printed every violation and always
exited zero. That is the right call for a baseline and the wrong call for a
boundary, because an advisory scan is one that everyone stops reading.

| Tier | Meaning | Behavior |
|---|---|---|
| Approved | Anything under `packages/core/src/adapters/` | Silent, this is where GSAP belongs |
| Quarantined | Named entries in `scripts/v5-gsap-allowlist.mjs` | Reported, non-blocking, **may only shrink** |
| Renderer surface | `packages/react/src/` | Reported, strict-blocking, classification pending |
| Unapproved | Anything else in core importing `gsap` | **Fails immediately**, both modes |

A stale quarantine entry, meaning a file that was cleaned up but left in the
list, is also a blocking failure. The list cannot silently grow and cannot
silently rot.

The same allowlist backs the blocking suite in
`packages/core/src/gsap-boundary.test.js`, so the suite and the script can never
disagree about what is permitted.

## GSAP boundary status

**Closed in P2-02:** no production module outside `adapters/` in core imports the
vendor package. `Motion.js`, `TriggerDelegate.js` and `BuildTrackTween.js` import
`gsap` from `adapters/gsapPlatform.js`, and `gsapTickerClock` moved to
`adapters/gsap/gsapTickerClock.js` with a documented re-export shim at the old
path.

**Explicitly not claimed:** core is not GSAP-free. Re-exporting the vendor object
from one adapter module is a choke point, not an abstraction. `Motion` still
calls `gsap.to` directly for scheduling and reflow instead of going through the
`Interpolator`/`Scheduler` ports. Still open, still owned by P2-02.

**Quarantined: ten entries, nine tests and one fixture.** Earlier revisions of
this document said five. Quote the count from `scripts/v5-gsap-allowlist.mjs`;
the list length is the progress metric.

**Renderer surface: five files** under `packages/react/src/hooks` import `gsap`
or `gsap/ScrollTrigger` directly, three production hooks and two test mocks. This
surface was completely unscanned until F-14. Decide whether the DOM hooks layer
is an approved renderer adapter or a migration target before P2-06.

## Scan coverage

- Roots: `packages/core/src/` and `packages/react/src/`.
- The Track ownership check matches the full P2-03 ban list from
  [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md), private state included,
  and reports which symbols matched. Before F-14 it matched six public symbols
  only, so the symbol-ban evidence could have passed with `#observed`,
  `#observers`, `observerCount` and `observerIds` all still in place.

## Track ownership status

Still open and intentionally non-blocking, since moving them is P2-03 and P2-04
work:

- observation mutators and state on `Track`, currently duplicated between `Track`
  and `StandaloneObservationAdapter` (F-03), with four external consumers of
  `observedEdges` to migrate first (F-01);
- child topology and the group-host/playback bridge, whose Motion-side
  replacements exist but have no callers (F-17).

## Baseline policy

Run the commands above before implementation work proceeds. Attach the resulting
CI links and benchmark artifact to the work package's pull request. If a command
is unavailable or fails for an unrelated pre-existing reason, record it here with
an owner rather than weakening the gate.
