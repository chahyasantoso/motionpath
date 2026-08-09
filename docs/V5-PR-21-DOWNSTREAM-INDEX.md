# PR-21: measurement-gated downstream invalidation index

**Status:** merged and accepted as the PR-21 optimization gate  
**Canonical index:** [`V5-README.md`](./V5-README.md)  
**Current status:** [`V5-STATUS.md`](./V5-STATUS.md)

## Result

`GraphPublisher.#markDownstream()` now uses a validated source-to-dependent adjacency index instead of scanning every node's upstream list for each invalidation seed. The queue and `seen` set are unchanged, so transitive closure, cycle safety, and canonical publish order remain the same.

The apples-to-apples benchmark used the same 60-chain x 5-node forest, seed, iterations, and both execution orders. It proved equal closure and a **43.39x speedup**. Standard checks and rig scenarios were green before merge.

## Boundaries

This is an optimization only. It does not change the public API, graph semantics, or default flags. The index must be disposed with the publisher, and failed graph validation must preserve the prior graph and cache.

## Documentation note

The old draft wording saying the PR was “in progress” is superseded. PR-21 is merged. Any future optimization must add a new measured record rather than editing this result retroactively.
