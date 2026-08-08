# MotionPath v5 pass-2 boundary audit

**Work packages:** P2-00 (baseline), P2-02 (GSAP boundary)  
**Captured:** 2026-08-08 Asia/Jakarta  
**Corrected:** 2026-08-08 21:10 Asia/Jakarta, per [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md) findings F-12, F-14, F-16  
**Plan:** [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md), pass-2 revision A

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

Strict mode is the future completion gate:

```text
node scripts/v5-pass2-boundaries.mjs --strict
```

## What automation actually runs (corrected)

This section exists because the enforcement claim below was broader than the CI reality.

| Check | In CI? | Notes |
|---|---|---|
| GSAP import boundary | **Yes** | Through `packages/core/src/gsap-boundary.test.js` under `npm test`. Genuinely blocking. |
| `boundary:v5:pass2` script | **No** | Not referenced anywhere in `.github/workflows/ci.yml`. F-12. |
| `--strict` completion gate | **No** | Runs nowhere. F-12. |
| `format:check` on source | **No** | CI runs `format:check:ci`, which checks `package.json` and `ci.yml` only. F-11. |
| Benchmarks | Yes, non-blocking | Both jobs are `continue-on-error: true`, no regression thresholds. F-13. |

So the boundary is enforced for GSAP and advisory for everything else. Wire the script into CI before citing it as a gate.

## Enforcement model (changed in P2-02)

P2-00 shipped this scan in pure audit mode: it printed every violation and
always exited zero. That is the right call for a baseline and the wrong call
for a boundary, because an advisory scan is one that everyone stops reading.

The boundary is enforced in three tiers:

| Tier | Meaning | Behavior |
|---|---|---|
| Approved | Anything under `packages/core/src/adapters/` | Silent, this is where GSAP belongs |
| Quarantined | Named entries in `scripts/v5-gsap-allowlist.mjs` | Reported, non-blocking, **may only shrink** |
| Unapproved | Anything else importing `gsap` | **Fails immediately**, default and strict mode |

A stale quarantine entry, meaning a file that was cleaned up but left in the
list, is also a blocking failure. The list cannot silently grow and cannot
silently rot.

The same allowlist backs the blocking suite in
`packages/core/src/gsap-boundary.test.js`, so CI and the audit script can never
disagree about what is permitted. Note that only the suite runs in CI.

## GSAP boundary status

**Closed in P2-02:** no production module outside `adapters/` imports the
vendor package. `Motion.js`, `TriggerDelegate.js`, and `BuildTrackTween.js`
import `gsap` from `adapters/gsapPlatform.js`, and `gsapTickerClock` moved
to `adapters/gsap/gsapTickerClock.js` with a documented re-export shim at the
old path.

**Explicitly not claimed:** core is not GSAP-free. Re-exporting the vendor
object from one adapter module is a choke point, not an abstraction. `Motion`
still calls `gsap.to` directly for scheduling and reflow rather than going
through the `Interpolator`/`Scheduler` ports. That work is still open and still
owned by P2-02 in the completion matrix.

**Quarantined: ten entries, nine tests and one fixture.** Earlier revisions of
this document and of the status/matrix docs said five. The count is quoted from
`scripts/v5-gsap-allowlist.mjs`; read it from the file rather than restating it,
because the list length is the progress metric. They retire when core tests move
to fake ports.

## Scan coverage gaps

- The Track ownership regex covers `setObserved`, `removeObserved`, `replaceObserved`, `observedEdges`, `observedSources`, and `_setGraphGuard`. It does **not** cover `#observed`, `#observers`, `observerCount`, `observerIds`, or `_setObservationComposer`, so the P2-03 symbol-ban evidence can pass with the reverse registry intact. F-14.
- Both the scan and the GSAP suite walk `packages/core/src` only. `packages/react` is unchecked.

## Track ownership status

Still open and intentionally non-blocking, since moving them is P2-03 and
P2-04 work, not P2-02 work:

- observation mutators and observation state on `Track`, now duplicated between `Track` and `StandaloneObservationAdapter`, see F-03;
- child topology and group-host/playback bridge methods on `Track`, whose Motion-side replacements exist but have no callers, see F-17.

## Baseline policy

Run the commands above before implementation work proceeds. Attach the
resulting CI links and benchmark artifact to the work package's pull request.
If a command is unavailable or fails for an unrelated pre-existing reason,
record it here with an owner rather than weakening the gate.
