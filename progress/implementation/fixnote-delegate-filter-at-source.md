# Fix-Note: Filter delegate motions before build, not inside it

**Supersedes:** `fixnote-delegate-eager-build.md` (the in-loop `isDelegate`
branch version). Same underlying problem, cleaner fix — read this one instead.

**Scope:** `src/lib/builder.js` (the actual fix), `src/lib/ProductionEngine.js`
(one deletion, a *consequence* of the real fix, not a separate patch),
`src/lib/EditorEngine.js` (no code change — one new test documenting an
already-correct behavior change).

---

## Problem, restated architecturally

The original finding was "delegate tracks get built twice, wastefully."
The deeper issue underneath it: `buildProject()` treats `schema.motions` as one
uniform population and only discovers mid-loop that `delegate` motions need
different treatment — so the difference gets expressed as an `if` bolted onto
a loop that was never designed to fork. That same pattern then re-appears
downstream: `ProductionEngine`'s trigger-wiring loop has its own
`if (motion.driverType === 'delegate') continue;` for the same underlying
reason — a delegate motion reaches a place it was never going to be used.

Two motion driver types with genuinely different lifecycles (eager/shared/
triggered vs. lazy/private/polled) are being pushed through one pipeline and
excused after the fact, twice, in two different files. That's the smell —
not any single `if` on its own.

## Decision

**Filter, don't branch.** Exclude `driver:"delegate"` motions from
`buildProject`'s working set *before* the per-motion loop starts, so the loop
body needs no delegate-awareness at all — there's nothing to skip because
there's nothing delegate in the list. `buildResult.motions` then only ever
contains `driver:"timeline"` motions, by construction.

This is smaller than the previous draft's in-loop branch (net deletion, not
addition) and it removes `ProductionEngine`'s `continue` check too — not as a
second fix, but because the condition it guards against becomes structurally
impossible once delegate motions are never in `buildResult.motions` to begin
with.

**One real, verified behavior change worth calling out explicitly (not
hidden in a diff):** `EditorEngine.setProgress(target, progress)` currently
finds a delegate motion's (dead, unused) entry via
`motions.find(m => ... m.motionId === target)` and calls
`.progress(clamped)` on its orphaned timeline — a call that mechanically
succeeds but has zero observable effect, since nothing reads that timeline.
After this fix, the same call falls through to
`throw new Error('setProgress: no group or motion found for target "X".')`.
This is a **good** change — silently-succeeds-but-does-nothing becomes a
clear error, consistent with the project's throw-don't-swallow philosophy —
but it is a real, user-facing change to `setProgress`'s contract for delegate
motionIds, and needs its own test (see checklist), not just incidental
coverage.

**Verified safe:** `motionIndex` (assigned as the loop position `i`) is
self-referential to `buildResult.motions` only — every reader of it
(`primaryMotionIndex`/`groupsMap` in `builder.js`, the `String(m.motionIndex)`
match in `EditorEngine.setProgress`) is computed and consumed entirely within
this same build output, never checked against `schema.motions`'s raw
position. So excluding delegate motions before assigning `motionIndex`
(rather than after) does not desync any index-based lookup. No known
EditorEngine UI exists yet that passes raw schema-array positions as
`target` strings (per prior review: "Editor rebuild — still unscoped, no plan
exists"), so this carries no live-caller risk today — flagged here so it's
verified, not assumed, if that changes later.

---

## CORRECT

**`buildProject()` in `builder.js` — filter before the loop, loop body
unchanged from its pre-delegate-awareness form:**

```js
export async function buildProject(schema, deps) {
  // Delegate motions have a fundamentally different lifecycle — lazily built
  // and privately cached by resolveMotion.js, never triggered, never
  // subscribed/composed via the DOM path. They never belong in this eager
  // build's working set. Filtering here means nothing below this line needs
  // to know delegate motions exist at all.
  const motionsArray = (schema.motions || []).filter(
    m => m.driver?.type !== 'delegate'
  );

  // ...tracksMap, trackPlugins, motions = [] declared as before...

  for (let i = 0; i < motionsArray.length; i++) {
    const motion = motionsArray[i];
    const sectionId = motion.driver?.sectionId;

    let triggerType = 'time';
    const trigger = motion.driver?.trigger || {};
    if (trigger.type === 'scroll') {
      triggerType = trigger.scrub ? 'scroll-scrub' : 'scroll-observer';
    }

    const rawTracks = motion.tracks || [];
    const tracks = rawTracks.map(t => resolveTrack(t, schema.templates));
    const trackTweens = [];

    for (const track of tracks) {
      const keyframes = track.keyframes || {};
      const propKeys = Object.keys(keyframes);

      for (const propKey of propKeys) {
        const plugin = resolvePluginForKey(propKey);
        if (plugin) {
          await ensureLoaded(plugin);
        }
      }

      const tweenDuration = track.duration ?? motion.driver?.trigger?.duration ?? 1;

      const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(
        track.id,
        keyframes,
        tweenDuration,
        track
      );

      trackPlugins.set(track.id, resolvedPlugins);
      trackTweens.push(tween);
      tracksMap.set(track.id, { proxy, trackConfig: track, tween });
    }

    const motionTimeline = gsap.timeline({ paused: true });

    if (
      (trigger.type === 'time' || (trigger.type === 'scroll' && !trigger.scrub)) &&
      typeof trigger.delay === 'number'
    ) {
      motionTimeline.delay(trigger.delay);
    }

    tracks.forEach((track, idx) => {
      const tween = trackTweens[idx];
      const offset = typeof motion.stagger === 'number' ? motion.stagger * idx : 0;
      motionTimeline.add(tween, offset);
    });

    const isPrimary = motion.driver?.timelineId ? !!motion.driver.primary : false;

    const motionBuild = {
      motionIndex: i,
      motionId: motion.motionId,
      sectionId: sectionId,
      triggerType: triggerType,
      triggerConfig: trigger,
      timeline: motionTimeline,
      isPrimary: isPrimary,
      driverType: motion.driver?.type || 'timeline'
      // driverType will only ever be 'timeline' here now — delegate never
      // reaches this loop. Field kept for shape-compatibility with existing
      // consumers/tests that read it; not a signal to branch on anymore.
    };

    if (motion.driver?.timelineId) {
      motionBuild.timelineId = motion.driver.timelineId;
    }

    motions.push(motionBuild);
  }

  // ...groupsMap / timelineGroups construction unchanged...
}
```

**`ProductionEngine.js` — delete the now-dead check, loop body otherwise unchanged:**

```js
for (const motion of motions) {
  const { timelineId, sectionId, triggerType, triggerConfig } = motion;
  // ...rest of the loop exactly as it is today...
}
```

## WRONG

```js
// WRONG — filtering AND keeping the in-loop isDelegate branch "just in case".
// If the filter is correct, the branch is unreachable dead code; if it's kept
// "for safety", it silently masks a real bug if the filter is ever removed
// or miswritten (the branch would quietly resume its old workaround instead
// of the test suite failing loudly). Pick one guard, not two doing the same job.
const motionsArray = (schema.motions || []).filter(m => m.driver?.type !== 'delegate');
for (let i = 0; i < motionsArray.length; i++) {
  const motion = motionsArray[i];
  if (motion.driver?.type === 'delegate') continue; // WRONG — dead, and hides drift
  // ...
}
```

```js
// WRONG — leaving ProductionEngine's delegate check in place after the filter
// lands. It's not wrong at runtime (it'll just never fire), but it's a stale
// comment/guard describing a state that can no longer occur — the exact
// "docstring describes old behavior" problem this project has been bitten by
// twice already. Delete it, don't leave it as defensive dead code.
for (const motion of motions) {
  if (motion.driverType === 'delegate') continue; // WRONG — leave this in
  // ...
}
```

---

## Non-Goals

- Do not change `EditorEngine.setProgress`'s code — no fix needed there, its
  existing fallback (`throw ... no group or motion found`) already produces
  the correct new behavior for free once delegate motions are absent from
  `buildResult.motions`. Only a new test is needed, not new code.
- Do not add a structural pre-validation pass for delegate track correctness
  (same as the prior draft — deferred-detection-via-`resolveMotion`'s-throw
  remains the accepted tradeoff, unchanged by this rewrite).
- Do not touch `resolveMotion.js` — still fully decoupled, still unaffected.
- Do not touch the `composePatch` fix-note's scope — independent, land in
  either order.

---

## Verification Checklist (grep-able, run after implementation)

1. `grep -n "isDelegate\|driver?.type === 'delegate'" src/lib/builder.js`
   → **exactly one hit**, in the filter line at the top of `buildProject`.
   Zero hits anywhere inside the per-motion loop body.
2. `grep -n "driverType === 'delegate'" src/lib/ProductionEngine.js`
   → **zero hits** (the dead check is gone, not just unreachable)
3. Build a mixed project (one delegate motion, one timeline motion). Assert:
   - `buildResult.motions.length === 1` (only the timeline motion)
   - `buildResult.tracks.has(<delegate track id>)` → **false**
4. Regression: `productionEngine.resolveMotion(<delegate motion id>, 0.5)`
   still resolves correctly on the same mixed project (proves the decoupling
   assumption still holds after this structural change — same check as the
   prior draft, re-run because the fix mechanism changed)
5. **New, explicit test** for the `setProgress` contract change: build a
   project containing a delegate motion, call
   `editorEngine.setProgress(<delegate motionId>, 0.5)`, assert it **throws**
   `/no group or motion found/`. This test is the one that locks in the
   accepted behavior change — without it, nothing distinguishes "we knew this
   would happen" from "this broke and nobody noticed."
6. `ProductionEngine.loadProject()` on a schema mixing delegate + timeline +
   grouped (`timelineId`) motions still wires triggers correctly for the
   non-delegate ones — full existing trigger-wiring test coverage should pass
   unchanged, since the loop body itself didn't change, only its input list.
7. Full test suite passes, 225 baseline + new tests from this fix-note.
