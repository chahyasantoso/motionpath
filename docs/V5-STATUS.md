# MotionPath v5 status

**Purpose:** living handoff for implementation state.

**Status captured:** 2026-08-07 21:05 Asia/Jakarta  
**Branch reviewed:** `v5-pr-11-delete-migration-adapter`  
**Base branch:** `v5`  
**Base SHA:** `d815263678c463c2c759bd99ae47160e26e1d23b`  
**Active PR:** #91, migration adapter deletion and Motion-owned dynamic hosts.

## Current position

Review findings #1, #3, and #5 are resolved in merged PRs #89, #88, and #90. PR-11 is now executing the approved deletion gate, with the live Spiral consumers migrated first.

## PR-11 scope

- delete `CompositeRuntime` and its adapter-only tests
- remove `TrackGroup` and `Engine.createGroupHost`
- add `Engine.createMotionHost`, using the existing `Motion` scheduler directly
- migrate both Spiral controllers and the integration evidence to Motion-owned hosts
- preserve the publisher/runtime path as opt-in; no default rendering flip

## Gate state

- **Checkpoint A:** passed
- **Checkpoint B:** passed and backed by actual controller evidence
- **Checkpoint C:** pending PR-11 merge with green CI
- **Findings open:** #2 production GraphRuntime integration, #4 public exports, #6 nested Motion scheduling, #7 GSAP ports

## Resume rule

If CI is red, stop and use the supplied logs. If green, merge PR-11, update this file from the merged `v5` head, then proceed to PR-12 ports and the nested scheduler proof.
