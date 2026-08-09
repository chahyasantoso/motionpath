# MotionPath v5 documentation

This is the **single entry point** for the v5 refactor docs. Read in this order.

## Current truth

1. [`V5-STATUS.md`](./V5-STATUS.md): current landed work, open PRs, risks, and session handoff.
2. [`V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md`](./V5-NEXT-IMPLEMENTOR-HANDOFF-2026-08-09.md): the next slice, in order, with the hazards it has to remove.
3. [`V5-PASS-2-COMPLETION-MATRIX.md`](./V5-PASS-2-COMPLETION-MATRIX.md): pass-2 control sheet and rollout flag defaults.
4. [`V5-PASS-2-REVIEW-2026-08-08.md`](./V5-PASS-2-REVIEW-2026-08-08.md): full-pass implementation review and finding IDs.
5. [`V5-P2-03-SYMBOL-BAN.md`](./V5-P2-03-SYMBOL-BAN.md): the Track observation removal slice and its prerequisites.
6. [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md): accepted pass-2 revision A.
7. [`V5-ARCHITECTURE-REFACTOR-PLAN.md`](./V5-ARCHITECTURE-REFACTOR-PLAN.md): target ownership rules.

**Current handoff:** pass-2 is in progress. P2-03 standalone observation ownership
has proven parity between the compatibility and scoped owners, and scoped is
reachable through one explicit opt-in option. Every rollout flag is still
default-off. PR #142 is the frozen green baseline and must not merge; treat
`V5-STATUS.md` and the next implementor handoff as authoritative over any older
session note, including the dated review files.
