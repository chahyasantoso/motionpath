# MotionPath v5 immutable value contract

**Work package:** P2-01  
**Plan:** [`V5-IMPLEMENTATION-PLAN-PASS-2.md`](./V5-IMPLEMENTATION-PLAN-PASS-2.md), pass-2 revision A  
**Implementation:** `packages/core/src/contract/immutableValue.js`

## Why one utility

Before P2-01 there were two different notions of immutability in the codebase.
`PatchRegistry` deep-cloned and froze patch values. `ObservationGraph` and
`GraphBinding` froze only their top-level containers and direct records, so a
graph snapshot was a frozen wrapper around mutable arrays. A consumer could
push a node onto `binding.graph.nodes` or rewrite `graph.edges[0].source` and
every later reader saw the edit as if the producer had published it.

There is now exactly one utility, one supported shape, and one documented rule
for what is copied versus retained by reference.

## Supported value shape

| Shape | Treatment |
|---|---|
| Primitives, `null`, `undefined` | Returned as-is |
| Arrays | Cloned element-wise, then frozen |
| Plain objects (`Object.prototype` or null prototype) | Cloned key-wise, then frozen |
| Everything else | **Foreign reference:** returned by identity, untouched and unfrozen |

"Everything else" explicitly includes DOM nodes, class instances, functions,
`Map`, `Set`, `Date`, and typed arrays. The runtime neither owns those objects
nor knows how to copy them, so pretending to freeze them would be a lie that
fails in the consumer's code. Callers who need a foreign value to be immutable
must convert it to supported data before publishing.

Only string-keyed enumerable own properties are copied. Symbol keys and
non-enumerable properties are outside the contract.

## Copy, not freeze-in-place

Supported values are cloned and then frozen. Freezing in place would be a side
effect on an object the runtime does not own: a plugin that returns a cached
contribution object would start throwing on its own next write, in the
consumer's code, for a reason that points nowhere near this module.

Two consequences that are contract, not accident:

- The caller's source object stays mutable and stays theirs.
- A published value is isolated from later mutation of its source.

## Identity and cycles

A `seen` map is shared across one conversion, so references that were shared
before conversion are still shared after it, and cycles resolve to the same
frozen clone instead of overflowing the stack. `toImmutableValues` and
`toImmutableList` share one `seen` across all keys or entries for the same
reason.

## Where it is enforced

| Boundary | Enforced by |
|---|---|
| Published patches | `PatchRegistry.publish` via `runtime/immutablePatchValue.js` |
| Normalized graph nodes, edges, diagnostics | `ObservationGraph` constructor |
| Committed graph snapshots | `GraphBinding` internal freeze |

## Coverage

- `packages/core/src/contract/__tests__/immutableValue.test.js`: shape, cloning, foreign references, cycles, shared identity, undefined-valued keys.
- `packages/core/src/usecases/__tests__/GraphImmutability.test.js`: strict-mode mutation attempts against normalized graphs and committed binding snapshots, including after a committed mutation.
- `packages/core/src/runtime/__tests__/PatchImmutability.test.js`: pre-existing patch coverage, retained unchanged as the regression guard for the moved implementation.

## Non-goals for P2-01

- No change to what the graph or the publisher *does*. This package changes
  reachability of mutation, not behavior.
- No support added for `Map`, `Set`, or class instances as graph or patch
  values. If a future plugin needs one, it gets an explicit contract change
  and a normalizer, not a silent deep-freeze attempt.
