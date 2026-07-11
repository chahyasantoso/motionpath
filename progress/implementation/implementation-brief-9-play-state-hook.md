# MotionPath — Implementation Brief 9: `useMotionTimelinePlayback` Hook

## Context

`useMotionProject` currently takes a `playStates` param and runs a second
internal effect that calls `playTimer`/`pauseTimer` whenever it changes,
guarded by a try/catch that silently swallows the "engine not ready yet"
race. This mixes two things that don't share a reason to change:
`useMotionProject`'s job is mount-once lifecycle (load on `[project]`
change, destroy on unmount); play/pause is an ongoing control channel that
can fire many times over a component's life and has nothing to do with
schema changes.

It also has a real scaling problem: today, only the top-level component
holding `useMotionProject` can control play-state, because only it has
`playStates`. Any independent idle-loop toggle owned by a different,
possibly deeply-nested component (e.g. a card that starts floating on
hover) has to lift its state up into the top-level page, which doesn't
scale as more independent toggles get added.

## Non-goals (explicit)

- **Do not flip the default play-state for `time` scenarios.** They stay
  auto-play-unless-explicitly-paused (`shouldPlay = ... ?? true`). This was
  deliberately evaluated and rejected — 4 of 5 existing `type:"time"`
  scenarios in the repo (Motorcycle's streaks/clouds/bike-loop) are ambient
  loops that must run with zero wiring; only the Pasar Malam lantern bounce
  needs to start paused. Flipping the default would silently freeze every
  one of those with no build-time signal.
- **Do not remove `initialPlayStates` (the load-time option) — only the
  reactive `playStates` param goes away.** A `time` scenario that must
  start paused (the lantern case) still needs its paused state baked into
  the `loadProject()` call itself, or there's a one-frame flash of motion
  before an effect-driven pause can land. Keep that path; only the
  *ongoing* control mechanism moves out.
- **No new try/catch-based race handling.** Route through the generalized
  deferred-call buffer described below instead — same underlying race
  `subscribe()` already has a tested solution for.

## 1. Generalize `deferredSubscribe.js` into a reusable deferred-call buffer

Current `createDeferredSubscribe()` is subscribe-specific. Generalize it to
buffer arbitrary calls against a not-yet-ready core, keeping the exact same
semantics it has today (buffer until `setCore`, flush in order,
`clearCore()` wipes pending — per the existing "Addendum B" test, only the
public `destroy()` path calls `clearCore()`, never the internal `_cleanup()`
used during in-flight reload; preserve that distinction, don't flatten it).

```js
// src/lib/deferredCall.js  (rename from deferredSubscribe.js, or keep the
// filename and add this alongside — decide based on how much churn it
// causes to existing imports; either is fine, but pick one and be
// consistent, don't leave both names in the codebase)

export function createDeferredCall() {
  let core = null;
  let pending = [];

  return {
    setCore(newCore) {
      core = newCore;
      const toFlush = pending;
      pending = [];
      for (const entry of toFlush) {
        if (!entry.cancelled) entry.run(newCore);
      }
    },

    clearCore() {
      core = null;
      pending = [];
    },

    // `run(core)` performs the actual call and returns whatever cleanup
    // (if any) should happen on cancel — mirrors subscribe()'s
    // unsubscribe-function pattern generically.
    call(run) {
      if (core) return run(core);
      const entry = { run, cancelled: false, cleanup: null };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
        if (entry.cleanup) entry.cleanup();
        pending = pending.filter(e => e !== entry);
      };
    },
  };
}
```

`subscribe(elementId, callback)` becomes a thin wrapper over `.call()`:

```js
subscribe(elementId, callback) {
  return this.call((core) => core.subscribe(elementId, callback));
}
```

Confirm this doesn't change `deferredSubscribe.test.js`'s existing
behavior — every current test (including the StrictMode double-mount
regression test and the Addendum B `clearCore` test) should still pass
unmodified against the rewritten implementation, since the observable
behavior for `subscribe()` specifically must be identical.

`ProductionEngine` uses the same buffer instance for `playTimer`/
`pauseTimer` calls now too:

```js
playTimer(timelineId) {
  return _deferredCall.call((core) => { /* existing playTimer logic against _core/_buildResult */ });
},
pauseTimer(timelineId) {
  return _deferredCall.call((core) => { /* existing pauseTimer logic */ });
},
```

Check the current `playTimer`/`pauseTimer` implementations before editing
— confirm they operate on `_buildResult`/`_core` state that's available at
the same point `subscribe()` already routes through this buffer, so the
same `setCore`/`clearCore` calls that already happen in `loadProject()`/
`destroy()` cover both.

## 2. New hook: `src/hooks/useMotionTimelinePlayback.js`

Symmetric to `useMotionSubscriber` — callable by any component at any
depth, not just the page holding `useMotionProject`:

```js
import { useEffect } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * Ongoing play/pause control for a timelineId, independent of project
 * load/unload. Any component, at any depth, can control any timeline's
 * play state — not just the component that called useMotionProject.
 *
 * @param {string} timelineId
 * @param {boolean} playing
 */
export default function useMotionTimelinePlayback(timelineId, playing) {
  useEffect(() => {
    if (!timelineId) return;
    if (playing) productionEngine.playTimer(timelineId);
    else productionEngine.pauseTimer(timelineId);
  }, [timelineId, playing]);
}
```

## 3. `useMotionProject.js` changes

Remove the `playStates` param and Effect 2 entirely. Add a narrow,
load-only `initialPlayStates` option, forwarded into `loadProject()`
exactly as `playStates` is today, but explicitly non-reactive:

```js
import { useEffect, useRef } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * @param {Object} project
 * @param {Object} [options]
 * @param {Object} [options.initialPlayStates] - Map of timelineId → boolean,
 *   applied once at load time only (prevents a one-frame flash of motion
 *   before a separate useMotionTimelinePlayback pause can land). Changing
 *   this after mount has no effect — use useMotionTimelinePlayback for
 *   ongoing control.
 */
export default function useMotionProject(project, { initialPlayStates = {} } = {}) {
  const projectRef = useRef(project);
  projectRef.current = project;
  const initialPlayStatesRef = useRef(initialPlayStates);
  initialPlayStatesRef.current = initialPlayStates;

  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;

    productionEngine
      .loadProject(projectRef.current, { playStates: initialPlayStatesRef.current })
      .catch(err => {
        if (!cancelled) console.error('[useMotionProject] loadProject failed:', err);
      });

    return () => {
      cancelled = true;
      productionEngine.destroy();
    };
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

Note the second argument's shape changes from a positional `playStates`
object to a `{ initialPlayStates }` options object — this is a breaking
change to every existing call site, see migration below.

## 4. Per-caller migration (Pasar Malam is the only current consumer)

`PasarMalamPage.jsx` currently threads a `playStates` object (containing
the lantern bounce's paused-until-scroll-threshold state) into
`useMotionProject`. After this brief:

```js
// Before
useMotionProject(project, { 'lantern-bounce-tl': bouncing });

// After
useMotionProject(project, { initialPlayStates: { 'lantern-bounce-tl': false } });
useMotionTimelinePlayback('lantern-bounce-tl', bouncing);
```

The scroll-threshold logic that computes `bouncing` doesn't change at all
— only which hook it's fed into.

## Verification checklist

1. Grep `useMotionProject.js` for `playTimer`/`pauseTimer` — zero results
   (that responsibility has fully moved to `useMotionTimelinePlayback`).
2. Grep the codebase for the old positional `useMotionProject(project,
   playStatesObject)` call shape — zero results; every caller uses the new
   `{ initialPlayStates }` options shape.
3. Behavioral test: `useMotionTimelinePlayback` called before the engine's
   `core` exists (mount race) — call gets buffered via the generalized
   deferred-call mechanism and correctly applied once `setCore()` fires,
   not silently dropped.
4. Behavioral test: a `time` scenario with no `initialPlayStates` entry at
   all — still auto-plays (confirms the default-play-state decision above
   wasn't accidentally touched by this refactor).
5. Behavioral test: Pasar Malam lantern — starts paused via
   `initialPlayStates`, then `useMotionTimelinePlayback` correctly starts
   it once the scroll threshold is crossed, with no one-frame flash of
   motion on initial load.
6. Full existing `deferredSubscribe.test.js` suite passes unmodified
   against the generalized `deferredCall` implementation.
7. Full existing test suite (189 tests as of last count) passes.
