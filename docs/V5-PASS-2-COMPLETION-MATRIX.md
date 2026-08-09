# MotionPath v5 pass-2 completion matrix

**Status captured:** 2026-08-09 08:30 Asia/Jakarta  
**Control sheet:** pass-2 revision A  
**Review:** [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md)  
**Resolution log:** [`V5-PASS-2-REVIEW-STATUS.md`](./V5-PASS-2-REVIEW-STATUS.md)

The current F-02 implementation uses one adapter per ProjectRuntime, with identity-keyed internal state so duplicate motion-local ids remain legal across qualified instances. The adapter preserves public ids while isolating state by Track object.

The remaining matrix is unchanged: F-01 inversion of the bridge is next; F-03 duplicate Track bookkeeping, F-06/F-07 duplicate mutation and cycle paths, F-08 owner-layer decision, and F-10 full-model rebuild remain open. Track topology/playback and publisher rollout remain separate.

PR #140 is merged as `72e7289`; its 8-check run passed. The F-02 follow-up is on `v5` commit `8f33f4e` and awaits its CI run.
