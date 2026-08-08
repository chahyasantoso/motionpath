# PR-21: measurement-gated downstream invalidation index

**Scope:** one optimization only, replacing a hot-path graph scan with an adjacency index.  
**Branch:** `v5-pr-21-downstream-index`  
**Base:** `v5` after PR #111  

## Why this candidate

`GraphPublisher.#markDownstream()` used to scan every `[targetId, upstream]` pair for every invalidation seed, then test `upstream.includes(sourceId)`. That is O(V + E) per BFS level in the common case and repeatedly walks unrelated nodes in a large forest.

PR-21 replaces that scan with `#downstream`, a source-to-dependent adjacency map built alongside `#upstream` in the validated graph state. The traversal still uses the same queue and `seen` set, so semantics are unchanged: every transitive dependent is invalidated once, cycles cannot loop, and canonical publish order remains authoritative.

## Measurement gate

The existing `benchmark:rig` command still runs the chain, large-forest, and idle-majority scenarios. It now also runs `performance/downstream-index-benchmark.mjs`, which repeatedly swaps one edge in a 60-chain x 5-node graph and flushes the resulting invalidation. CI must show the indexed version is materially faster for this mutation-heavy case without regressing the existing scenarios.

This PR does **not** claim a universal speedup. The baseline is the benchmark output from the parent `v5` commit, and the decision is made from the CI artifacts and retained-object results. If the index is not a clear win or changes output, close this PR without merging it.

## Correctness gate

The optimization is only valid if these stay unchanged:

- full downstream closure is marked after edge rewiring;
- independent branches remain untouched;
- failed graph validation leaves the previous graph and cache intact;
- disposal releases the index with the rest of the publisher;
- compose counts, patch revisions, ordering, and diagnostics remain identical.

No API or default behavior changes. The publisher gate remains default-off.
