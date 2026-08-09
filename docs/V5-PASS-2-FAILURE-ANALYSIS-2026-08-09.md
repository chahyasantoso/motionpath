# Pass-2 failed run analysis, 2026-08-09

## Run

The attached Node 24 run checked out PR #141's merge ref `0890a57`, with base `e4fc9b9` and head `88c12b1`. It reported **11 failed files, 18 failed tests, 610 passed**.

## Root-cause map

The failures were not 18 independent defects.

- **8 failures were one public-contract regression:** the adapter's private identity keys were returned from `getSources`, so legacy Track and adapter callers received strings such as `source` instead of the Track object. This affected Track, Track v4.3, GraphBinding rollback, initial wiring, createTrack ownership, and standalone adapter tests.
- **2 failures were state projection fallout:** GraphBinding representation parity and destroyed-track lifecycle exercised the same adapter/Track edge mismatch after the identity migration.
- **3 failures were readability guard failures:** `Track.js` and `GraphPublisher.js` on the PR merge ref were still dense, and `Track.js` had lost the required explanatory block comment. Both the older code-style guard and the newer readability boundary correctly caught this. This is a real code-quality failure, not duplicate noise.
- **1 failure was the original public compose-key leak:** internal keys such as `a#1` escaped into `Motion.composeGraph`; the adapter now translates internal composition state back to public Track ids.
- **1 failure was the incremental cache miss:** the same identity/context migration caused a second compose of an idle node; it remains a separate assertion to verify after the adapter contract is corrected.

## Fix in this PR

- Public `adapter.getSources(track)` returns Track objects, deduplicated by object identity.
- Legacy `adapter.state.getSources(id)` keeps internal state keys for existing Track getters that map those keys through the adapter registry.
- Public `adapter.state.getEdges` returns edges with Track objects, while the owner retains private keys internally.
- Composition contexts remain public-id keyed at the boundary and private-keyed only inside the owner.
- CI no longer runs both `push` and `pull_request` workflows for `feat/**`, `fix/**`, and `test/**`. Protected branches retain push validation; feature branches are validated by their PR. This reduces the visible PR check set from 16 to 8.

## Deliberately not hidden

The readability failures are still open in this PR. Do not remove the guards or raise their limits to make the board green. Restore the readable `Track.js`/`GraphPublisher.js` implementations in a separate focused commit, then rerun the full suite.
