# MotionPath v5 pass-2 boundary audit

**Work packages:** P2-00 (baseline), P2-02 (GSAP boundary)  
**Captured:** 2026-08-08 Asia/Jakarta  
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

## Enforcement model (changed in P2-02)

P2-00 shipped this scan in pure audit mode: it printed every violation and
always exited zero. That is the right call for a baseline and the wrong call
for a boundary, because an advisory scan is one that everyone stops reading.

The boundary is now enforced in three tiers:

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
disagree about what is permitted.

## GSAP boundary status

**Closed in P2-02:** no production module outside `adapters/` imports the
vendor package. `Motion.js`, `TriggerDelegate.js`, and `BuildTrackTween.js`
now import `gsap` from `adapters/gsapPlatform.js`, and `gsapTickerClock` moved
to `adapters/gsap/gsapTickerClock.js`.

**Explicitly not claimed:** core is not GSAP-free. Re-exporting the vendor
object from one adapter module is a choke point, not an abstraction. The
remaining work, moving those call sites onto the `Interpolator`, `Scheduler`,
and `Clock` ports so fake-backed core tests can run without loading GSAP at
all, is still open and still owned by P2-02 in the completion matrix.

**Quarantined:** five test and fixture files construct real GSAP tweens on
purpose. They retire when core tests move to fake ports.

## Track ownership status

Still open and intentionally non-blocking, since moving them is P2-03 and
P2-04 work, not P2-02 work:

- observation mutators and observation state on `Track`;
- child topology and group-host/playback bridge methods on `Track`.

## Baseline policy

Run the commands above before implementation work proceeds. Attach the
resulting CI links and benchmark artifact to the work package's pull request.
If a command is unavailable or fails for an unrelated pre-existing reason,
record it here with an owner rather than weakening the gate.
