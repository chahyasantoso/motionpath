# MotionPath v5 implementation review, historical snapshot

**Review date:** 2026-08-07 20:03 Asia/Jakarta  
**Reviewed base:** `v5` after PR-10 merge  
**Status:** historical, superseded by post-PR-115 evidence

This document records the review as it existed before PR #110 through PR #115. It is intentionally preserved for audit history, but it is **not current status**. Several findings and gate statements below describe the pre-merge state and must not be used to judge the current `v5` branch.

## Use these documents instead

- [`V5-README.md`](./V5-README.md): navigation and current interpretation.
- [`V5-STATUS.md`](./V5-STATUS.md): current implementation status and remaining risks.
- [`V5-REVIEW-FINDINGS-LOG.md`](./V5-REVIEW-FINDINGS-LOG.md): reconciled findings ledger.
- [`V5-IMPLEMENTATION-PLAN.md`](./V5-IMPLEMENTATION-PLAN.md): accepted PR-00 through PR-21 plan.
- [`V5-PR-21-DOWNSTREAM-INDEX.md`](./V5-PR-21-DOWNSTREAM-INDEX.md), [`V5-PR-22-FK-CONTRACT.md`](./V5-PR-22-FK-CONTRACT.md), and [`V5-PR-23-OBSERVATION-GRAPH.md`](./V5-PR-23-OBSERVATION-GRAPH.md): supplemental records.

## Reconciliation

The original findings were reviewed against the current `v5` head on 2026-08-08. Publisher delivery, public exports, repeated initialization, recursive scheduling, FK graph mode, runtime mode propagation, downstream indexing, and ObservationGraph metadata/index ownership have since landed. The remaining concerns are deep immutability, the exact GSAP import boundary, and completing live observation mutation extraction without pretending it is part of the accepted PR sequence.

The original recommendation remains valid in spirit: preserve conservative defaults, require evidence at migration boundaries, and avoid deleting compatibility or cycle-protection behavior without parity tests.