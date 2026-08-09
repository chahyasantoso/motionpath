# MotionPath v5 next implementor handoff

**Captured:** 2026-08-09 18:40 Asia/Jakarta  
**Branch:** `feat/pass2-track-facade-removal`  
**Head:** `3a631a0a87279259c8c9a5c09836c68b20a6e409`  
**PR:** [#145](https://github.com/chahyasantoso/motionpath/pull/145)  
**Review:** [`V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md`](./V5-PR-145-SENIOR-IMPLEMENTOR-REVIEW-2026-08-09.md)  
**Playbook:** [`V5-PR-145-IMPLEMENTOR-PLAYBOOK.md`](./V5-PR-145-IMPLEMENTOR-PLAYBOOK.md)

## Current truth

Do not merge this head. A fresh CI matrix is in progress after the review and documentation update. The prior reviewed head had both unit-test jobs failing. Completion requires one authoritative fully green matrix on the exact final ref.

The playbook is the implementation contract. It sequences gate repair, unit correctness, explicit compatibility boundaries, cross-owner rejection, authored ownership transfer, lifecycle restoration, honest ownership-mode evidence, public types, and final verification.

## Required order

1. Read the playbook and record the baseline.
2. Fix the exact-head unit failures and duplicate CI execution.
3. Make facade installation explicit and add runtime symbol-ban tests.
4. Reject implicit cross-owner mutation and add no-edge-loss isolation tests.
5. Make GraphBinding ownership transfer atomic and add bind/mutate/unbind tests.
6. Restore remove/destroy lifecycle contracts and invalidation tests.
7. Remove GraphBinding double mutation and decide whether ownership modes are independent or one mode.
8. Finish TypeScript declarations, source formatting, and deterministic performance evidence.
9. Run one authoritative full matrix, then refresh all docs and sign off.

## Guardrails

Keep `publisherRendering`, `crossMotion`, and `freeTracks` default-off. Keep P2-04 topology/playback separate. Do not accept source-text absence as proof that the runtime Track surface is clean, and do not use alias-versus-alias tests as ownership parity evidence.
