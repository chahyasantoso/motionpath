# MotionPath v5 status

**Status captured:** 2026-08-09 15:00 Jakarta  
**Branch:** `feat/pass2-scoped-adapter-migration`  
**Last green baseline:** `c74601f`, 129 files and 712 tests green  
**Latest fix:** `7f04915`, verification pending  
**Safe frozen baseline:** PR #142 at `184f194`  
**Canonical index:** [`V5-README.md`](./V5-README.md)  
**Implementation report:** [`V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md`](./V5-PASS-2-IMPLEMENTATION-REPORT-2026-08-09.md)  
**Next implementor handoff:** [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md)

## Executive status

The owner-backed Track projection cut is implemented, but the first verification
run found four failures: 22 readability violations in `Track.js`, one missing
comment-ratio point, and one replacement lifecycle event with `role: undefined`.
The fix is `7f04915`: Track formatting and explanatory comments are restored, and
replacement/removal events now carry the owner edge role and input. Full matrix
verification is pending; do not call this head green yet.

## Current architecture

- ProjectRuntime owns one observation adapter; process-wide adapter globals are gone.
- ObservationState is authoritative after construction hydration.
- GraphBinding injects an ObservationTrackController into authored Tracks.
- Track forwards observation mutation, composition, reads, and lifecycle through
  the owner facade; it no longer stores a local edge map or reverse observer map.
- Compatibility remains the default. Scoped ownership remains explicit opt-in.

## Remaining work

Run build first, then the full Node 24 matrix and both boundary modes. If green,
close the session with the handoff and keep the next slice focused on deleting the
remaining compatibility forwarding symbols from Track and migrating any direct
callers. Do not mix P2-04 child topology/playback removal into this session.

## Guardrails

Never weaken parity assertions or hide boundary findings with scanner exceptions.
Keep `publisherRendering`, `crossMotion`, `freeTracks`, and `observationOwnership`
default-off/default-compatibility.
