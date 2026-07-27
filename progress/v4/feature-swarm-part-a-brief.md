# Implementation Brief: Feature Swarm Part A — Fix Instance Identity in Engine.mountInstance

**Branch:** `v4`
**Type:** Bug fix — live, currently-reproducible breakage, not a new feature
**Design reference:** `feature-swarm-design.md` (Part A section) — this brief makes it concrete and implementation-ready.

---

## Step 0 — Verification Gate (do this before writing any code)

```bash
grep -n "this.#instances.set(motion.id" src/engines/Engine.js
grep -n "existing.destroy" src/engines/Engine.js
grep -rn "unmountInstance(" src/ --include=*.js --include=*.jsx
grep -rn "instance\.id\b\|motion\.id\b" src/ --include=*.js --include=*.jsx
```

Expected findings:

- `Engine.#instances` is keyed by `motion.id`, which is set directly to `motionConfig.id` — the schema's motionId, identical on every mount call for the same motion.
- `mountInstance` destroys and replaces whatever entry already exists for that key before building the new one.
- `unmountInstance` has **zero callers** anywhere in the codebase (only its own definition matches).
- `.id`/`.motionId` on a `Motion` instance is read in exactly one place outside `Engine.js` itself, and that place is unrelated (schema validator error-path strings, a different `motionId` concept entirely — confirm this before assuming the fix is as low-blast-radius as described below).

If any of these don't match current source, stop and re-report actual findings before implementing.

---

## 1. Problem Statement

`Engine.#instances` is a `Map<motionId, Motion>` — a singleton-per-schema-template cache. Every `mountInstance(motionId)` call:

1. Checks for an existing entry under that exact `motionId` string.
2. If found, `.destroy()`s it and deletes the entry.
3. Builds a fresh `Motion`, storing it under the same `motionId` key.

This is correct for the "one motion, one instance" case (`CarouselDemo`, `HelixDemo`, any single scroll/time-triggered section) — but wrong for anything that needs **N independent, concurrently-alive instances of the same schema motion**. `TowerDefensePage.jsx` spawns enemies via `engine.mountInstance('lane-1-path')`, the same literal string, once per enemy, with no per-enemy suffix. The second enemy's spawn call finds the first enemy's `Motion` already sitting under that key, destroys it — mid-flight, mid-animation — and replaces it. **Only one enemy per lane can ever be alive.**

Confirmed via direct comparison with v3: `MotionInstance` generates a globally unique id per instance (`inst-${++counter}`), independent of `motionId`; `_instances` is keyed by that unique id; `mountInstance` never dedupes or destroys based on `motionId`. The "one instance per motionId" behavior demos rely on today isn't an engine guarantee in v3 — it falls out entirely of `useMotionInstance`'s `useEffect` running once per mount and cleaning up correctly on unmount. The engine itself was always meant to hand back a fresh, independent instance on every call.

---

## 2. Locked Decisions

- **`Engine.#instances` for MOTIONS is keyed by a unique per-instance id, generated inside `mountInstance` — never by the schema's `motionId`.** `mountInstance('lane-1-path')` called 10 times produces 10 independently-alive `Motion` instances.
- **The "destroy existing entry, then rebuild" branch is removed entirely for the motion path.** It doesn't exist in v3 and is fundamentally incompatible with concurrent instances — there is no "the" existing instance to destroy once multiple can share a `motionId`.
- **`Motion`'s constructor is unchanged.** It already just does `this.id = id` with no internal logic depending on what `id` means (confirmed: `this.id` is never read anywhere else inside `Motion.js`). The fix lives entirely in what `Engine.mountInstance` passes as `id` — no changes needed to `Motion.js` itself.
- **`motion.motionId` (the schema id) is still recorded on the instance, just not as the map key** — set directly by `Engine.mountInstance` after construction (`motion.motionId = motionConfig.id`), for debugging/future reference (e.g. Feature Swarm Part B may want it). Not load-bearing anywhere today; purely additive, zero risk.
- **`Engine.unmountInstance(motionId)` is deleted, not redesigned.** Zero callers exist (grepped, confirmed). Every current caller (`useMotionInstance`'s cleanup, `TowerDefensePage`'s enemy-death handling) already holds the instance reference directly and calls `.destroy()` on it. "Unmount by motionId" stops being a meaningful operation once a motionId can map to zero, one, or many live instances — there's no sensible single thing to unmount by that key alone.
- **The standalone-track branch of `mountInstance` (the `trackConfig` fallback, for top-level schema `tracks[]` entries) is INTENTIONALLY left unchanged — still keyed by the track's own schema id.** This is a deliberate asymmetry, not an oversight: `Engine.getTrack(trackId)` is built and tested (`Engine.test.js`) around the contract "look up an already-mounted track later, by its schema id" — a singleton-per-schema-id model. No current use case needs multiple concurrent instances of the same _standalone track_ mounted via this path (TowerDefense's enemies are MOTIONS with `trigger: {type: 'manual'}`, not standalone tracks, so they don't go through this branch at all). If that need ever appears, it should get the same unique-id treatment — but that would also mean `Engine.getTrack`'s "look it up again later by schema id" contract no longer holds for tracks, same as it doesn't for motions after this fix. Don't speculatively apply that change now without a concrete driver.

## 3. Non-Goals

- Do NOT touch `Engine.getTrack` beyond what's already fixed (null-on-miss) — its "singleton lookup by schema id" contract for standalone tracks is intentionally preserved per the decision above.
- Do NOT implement Feature Swarm Part B (per-instance trigger-ref resolution) in this brief — that's a separate, larger, deliberately-deferred piece of work with no current concrete driver.
- Do NOT change `TowerDefensePage.jsx` to adopt the `Track`-direct alternative discussed separately (bypassing `Motion`/`Engine` entirely) — that's a different, not-yet-decided architectural direction for that demo specifically. This brief fixes the engine regardless of which direction TowerDefense ends up taking.
- Do NOT add instance pooling or reuse across `mountInstance` calls — every call still builds fresh, matching the existing "remount rebuilds fresh" principle. This brief removes the _unrelated-instance-destroying_ side effect, not the _build-fresh-every-time_ behavior.
- Do NOT rename or restructure `Motion`'s public API (`.id`, `.mount`, `.getTrack`, etc.) beyond adding the new `.motionId` property.

---

## 4. CORRECT / WRONG

**WRONG (current):**

```js
export class Engine {
  #triggerRefs = new TriggerRefRegistry();
  #v4Project = null;
  #instances = new Map();

  mountInstance(motionId, config = {}) {
    if (!this.#v4Project) {
      throw new Error('mountInstance: project not loaded.');
    }

    const existing = this.#instances.get(motionId);
    if (existing) {
      existing.destroy?.();
      this.#instances.delete(motionId);
    }

    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (motionConfig) {
      const triggerType = motionConfig.trigger?.type;
      const factory = triggerDelegateRegistry.get(triggerType);
      if (!factory) {
        throw new Error(`Unknown trigger type "${triggerType}" on motion "${motionId}".`);
      }

      const delegate = factory(motionConfig.trigger);
      const motion = new Motion({
        id: motionConfig.id,
        triggerDelegate: delegate,
        staggerTransition: motionConfig.staggerTransition,
      });

      const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
      const motionTracks = motionConfig.tracks || [];
      for (let i = 0; i < motionTracks.length; i++) {
        const trackConfig = motionTracks[i];
        const track = createTrack(trackConfig, this.#v4Project.templates);
        motion.mount(track, i * stagger);
      }

      motion.init((id) => this.resolveElement(id));

      this.#instances.set(motion.id, motion);
      return motion;
    }

    const trackConfig = this.#v4Project.getTrackConfig(motionId);
    if (trackConfig) {
      const track = createTrack(trackConfig, this.#v4Project.templates);
      this.#instances.set(track.id, track);
      return track;
    }

    throw new Error(`mountInstance: motion or track "${motionId}" not found in project.`);
  }

  unmountInstance(motionId) {
    const inst = this.#instances.get(motionId);
    if (inst) {
      inst.destroy?.();
      this.#instances.delete(motionId);
    }
  }
  ...
}
```

**CORRECT:**

```js
export class Engine {
  #triggerRefs = new TriggerRefRegistry();
  #v4Project = null;
  #instances = new Map();
  #instanceCounter = 0;

  mountInstance(motionId, config = {}) {
    if (!this.#v4Project) {
      throw new Error('mountInstance: project not loaded.');
    }

    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (motionConfig) {
      const triggerType = motionConfig.trigger?.type;
      const factory = triggerDelegateRegistry.get(triggerType);
      if (!factory) {
        throw new Error(`Unknown trigger type "${triggerType}" on motion "${motionId}".`);
      }

      const delegate = factory(motionConfig.trigger);
      // Unique per-instance id — NEVER the schema motionId. Lets the same
      // motionId be mounted any number of times concurrently (e.g. one
      // TowerDefense enemy instance per spawn, all sharing 'lane-1-path').
      // Matches v3: MotionInstance generated a globally unique id
      // (inst-${counter}), independent of motionId, and never deduped on it.
      const instanceId = `motion-${++this.#instanceCounter}`;
      const motion = new Motion({
        id: instanceId,
        triggerDelegate: delegate,
        staggerTransition: motionConfig.staggerTransition,
      });
      motion.motionId = motionConfig.id; // schema id, for reference — not the map key

      const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
      const motionTracks = motionConfig.tracks || [];
      for (let i = 0; i < motionTracks.length; i++) {
        const trackConfig = motionTracks[i];
        const track = createTrack(trackConfig, this.#v4Project.templates);
        motion.mount(track, i * stagger);
      }

      motion.init((id) => this.resolveElement(id));

      this.#instances.set(motion.id, motion); // keyed by the unique instanceId now
      return motion;
    }

    // Standalone top-level tracks: deliberately UNCHANGED, still keyed by
    // schema id — see Locked Decisions for why this asymmetry is intentional.
    const trackConfig = this.#v4Project.getTrackConfig(motionId);
    if (trackConfig) {
      const track = createTrack(trackConfig, this.#v4Project.templates);
      this.#instances.set(track.id, track);
      return track;
    }

    throw new Error(`mountInstance: motion or track "${motionId}" not found in project.`);
  }

  // unmountInstance(motionId) REMOVED — zero callers (grepped, confirmed).
  // Every caller already holds the returned instance and calls .destroy()
  // on it directly. "Unmount by motionId" is no longer a coherent operation
  // once one motionId can map to zero, one, or many concurrently-live
  // instances — there's nothing single to unmount by that key alone.
  ...
}
```

Note: `#instances.delete(...)` on destroy is still handled correctly — `useMotionInstance`'s cleanup and `TowerDefensePage`'s enemy-death path both call `.destroy()` directly on their own held reference, not through the engine, so removing `unmountInstance` doesn't strand any cleanup logic. **But check:** does `Motion.destroy()`/`Track.destroy()` itself remove its own entry from `Engine.#instances`? Grep and confirm before assuming stale entries can't accumulate — if not, that's a separate, smaller finding worth fixing alongside this (an instance-level `.destroy()` that doesn't tell the engine to drop its own map entry would leak a reference to a dead `Motion` object forever).

---

## 5. Verification Checklist

1. **Grep — keying fixed:**
   ```bash
   grep -n "this.#instances.set(motion.id" src/engines/Engine.js   # confirm motion.id is now instanceId-based, not motionConfig.id directly
   grep -n "existing.destroy\|const existing =" src/engines/Engine.js   # expect: no matches, branch removed
   grep -n "unmountInstance" src/engines/Engine.js   # expect: no matches, method removed
   ```
2. **Unit test — the actual TowerDefense scenario, directly:** mount the same `motionId` twice without destroying the first (`type: 'manual'` trigger is enough, no DOM needed) — assert BOTH returned instances remain independently alive and functional afterward (e.g. both still respond to `.getTrack()`/`.mount()`/seeking without throwing, and neither's internal state was torn down by the other's creation).
3. **Unit test — motionId no longer required to be unique per instance:** `mountInstance('same-id')` three times, assert three distinct object references come back, all simultaneously usable.
4. **Regression test — single-instance case still works exactly as before:** `useMotionInstance`-style mount → unmount (via `.destroy()`) → remount still produces exactly one live instance at a time, matching current demo behavior. This exercises the _replacement_ for the removed dedupe logic — cleanup now happens purely via the caller's own `.destroy()` call.
5. **Regression test — standalone track path unaffected:** re-run (or extend) `Engine.test.js`'s existing null-on-miss / cache-stability tests for the `trackConfig` branch — confirm still keyed by schema id, still returns the same cached object on repeat `getTrack` calls, unaffected by this change.
6. **Full suite run** — `npx vitest run`, confirm no existing test relied on the old "second mountInstance call for the same motionId replaces the first" behavior. (Checked already: no current demo calls `mountInstance` twice for the same id outside TowerDefense's already-broken pattern — but re-confirm on whatever the actual working tree looks like when this lands, since other work may have landed in between.)
7. **Full diff review for scope creep** — this brief touches only `Engine.js`. `Motion.js`, `Track.js`, and the standalone-track branch of `mountInstance` should show zero changes.

## 6. Files Expected to Change

- `src/engines/Engine.js` — `mountInstance`'s motion branch (unique id generation, remove dedupe-and-destroy), `unmountInstance` deleted
- A new or extended test file covering the concurrent-instance scenario directly (item 2/3 above) — likely `src/engines/__tests__/Engine.test.js`, already exists from the prior `getTrack` fix
