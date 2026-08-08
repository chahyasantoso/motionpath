# MotionPath v5 pass-2 boundary audit

**Work package:** P2-00  
**Branch:** `v5-pass-2-p2-00-baseline`  
**Captured:** 2026-08-08 11:46 Asia/Jakarta

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

The default boundary command is an audit mode: it prints every current violation and exits successfully so the baseline PR can land with the gap visible. The strict mode is the future completion gate:

```text
node scripts/v5-pass2-boundaries.mjs --strict
```

## Current expected findings

The initial audit is expected to report:

- direct GSAP imports outside `packages/core/src/adapters/`, including the clock and legacy/core tests;
- observation mutators and observation state on `Track`;
- child topology and playback bridge methods on `Track`.

These are intentionally not marked resolved by P2-00. P2-01 through P2-04 must reduce the findings, and P2-06/P2-07 must make strict mode green.

## Baseline policy

Run the commands above on this branch before implementation work proceeds. Attach the resulting CI links and benchmark artifact to the P2-00 pull request. If a command is unavailable or fails for an unrelated pre-existing reason, record it here with an owner rather than weakening the gate.
