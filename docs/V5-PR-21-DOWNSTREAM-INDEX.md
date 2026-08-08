# PR-21: measurement-gated downstream invalidation index

**Scope:** one optimization only, replacing a hot-path graph scan with an adjacency index.  
**Branch:** `v5-pr-21-downstream-index`  
**Base:** `v5` after PR #111  

## Why this candidate

`GraphPublisher.#markDownstream()` used to scan every `[targetId, upstream]` pair for every invalidation seed, then test `upstream.includes(sourceId)`. PR-21 replaces that scan with `#downstream`, a source-to-dependent adjacency map built alongside `#upstream` in the validated graph state.

The traversal still uses the same queue and `seen` set, so semantics are unchanged: every transitive dependent is invalidated once, cycles cannot loop, and canonical publish order remains authoritative.

## Measurement gate

The first benchmark was insufficient: it measured only the new implementation, so green CI could not prove a speedup. `performance/downstream-index-benchmark.mjs` now contains the exact pre-PR-21 scan as a benchmark oracle and compares it directly with the indexed traversal over the same 60-chain x 5-node forest, same seed, same iterations, and both execution orders to reduce JIT/cache bias.

It fails on a closure mismatch and reports old scan time, new indexed time, per-mutation time, and speedup. The normal `benchmark:rig` scenarios still run separately and must not regress.

This PR does **not** claim a universal speedup. Merge only when the apples-to-apples comparison is materially faster, the closures are equal, and the existing rig scenarios stay within the agreed budget. If the indexed path is not a clear win, close this PR without merging it.

## Correctness gate

The optimization is only valid if these stay unchanged:

- full downstream closure is marked after edge rewiring;
- independent branches remain untouched;
- failed graph validation leaves the previous graph and cache intact;
- disposal releases the index with the rest of the publisher;
- compose counts, patch revisions, ordering, and diagnostics remain identical.

No API or default behavior changes. The publisher gate remains default-off.
