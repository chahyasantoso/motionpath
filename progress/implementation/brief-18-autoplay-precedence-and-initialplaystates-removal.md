# Brief 18 — Schema-first autoplay precedence, remove dead `initialPlayStates`

## Context (read before touching anything)

Two related, already-decided fixes. Do not relitigate either — both were reached after tracing actual call sites, not guessed:

1. `driver.trigger.autoplay` in the schema is currently never read anywhere in the engine — only `config.autoplay` (the second argument to `mountInstance()`/`useMotionInstance()`) is consulted. This makes the schema field misleading: an author can write `autoplay: false` and it silently does nothing. Fix: schema wins when it explicitly declares a value; config only fills the gap when the schema is silent.
2. `initialPlayStates` (passed via `useMotionProject(project, { initialPlayStates })` → `loadProject(schema, { playStates })`) is **also** never read — `BaseEngine.loadProject`'s `options` parameter is accepted but never consumed in its body. Traced its one real usage (`PasarMalamPage.jsx`): it turns out fully redundant with `useMotionTimelinePlayback` + `config.autoplay`, which already solve the same problem more locally and more robustly. **Decision: delete `initialPlayStates` entirely, don't wire it up.** Do not add any `playStates`/`options` handling to `loadProject`.

## Locked decisions

- Autoplay precedence is `trigger.autoplay ?? config.autoplay ?? true` — schema first, config only as a fallback for what the schema doesn't specify. This is the opposite of "config always wins" — do not implement `config.autoplay ?? trigger.autoplay`.
- `initialPlayStates` is being deleted, not fixed. Do not add logic anywhere that reads `options.playStates` or `options.initialPlayStates`.
- `PasarMalamPage.jsx`'s flash-prevention need is met by passing `{ autoplay: false }` directly to the `useMotionInstance('lantern-bounce', ...)` call that already mounts the group's primary — no other file needs to change to preserve its current (already-correct) no-flash behavior.

## Non-goals

- Do not touch `TimelineGroupController.js`'s own `shouldPlay = primaryInstance.config.autoplay ?? true` read — that's a separate, already-correct code path (it reads the *primary instance's own* `config.autoplay` for grouped time motions) and is out of scope here. If you find it doesn't account for `trigger.autoplay`, flag it in your summary — don't fix it silently, this brief doesn't cover master-timeline-group autoplay precedence, only the ungrouped/single-instance path in `MotionInstance.#setupDriver`.
- Do not add a JSDoc `@typedef` or type changes beyond what's shown below.
- Do not change `spiralMotions.js`'s existing `driver.trigger.autoplay` values (`true` for `spiral-container`, `false` for `ball-exit`) — they're already correct for the new precedence, this brief doesn't touch that file.
- Do not remove or rename `config.autoplay` itself — it remains a valid fallback, just no longer the only source of truth.

---

## Fix 1 — `MotionInstance.js`, schema-first autoplay precedence

File: `src/domain/instance/MotionInstance.js`, inside `#setupDriver(config)`.

**WRONG (current):**
```js
      if (owns) {
        this.timeline
          .repeat(trigger.repeat ?? 0)
          .yoyo(!!trigger.yoyo)
          .repeatDelay(trigger.repeatDelay ?? 0);

        if (config.autoplay ?? true) {
          this.timeline.play();
        }
      }
```

**CORRECT:**
```js
      if (owns) {
        this.timeline
          .repeat(trigger.repeat ?? 0)
          .yoyo(!!trigger.yoyo)
          .repeatDelay(trigger.repeatDelay ?? 0);

        if (trigger.autoplay ?? config.autoplay ?? true) {
          this.timeline.play();
        }
      }
```

That's the entire functional change in this file. `trigger` is already defined earlier in the method (`const trigger = this.schemaMotion.driver?.trigger || {};`) — reuse it, don't redeclare.

### Verification checklist for Fix 1
- `grep -n "trigger.autoplay ?? config.autoplay ?? true" src/domain/instance/MotionInstance.js` returns exactly one match.
- `grep -n "config.autoplay ?? true" src/domain/instance/MotionInstance.js` returns zero matches (the old precedence must be fully gone, not left as a second code path).
- Add a test in `src/domain/instance/__tests__/MotionInstance.test.js` (or wherever existing `#setupDriver`/autoplay tests live — check first, don't create a duplicate file) asserting all three cases with a spy on `timeline.play`:
  - `trigger.autoplay: false`, `config.autoplay: true` → `play()` is **not** called. (Proves schema wins over config — this is the case that matters most, don't skip it.)
  - `trigger.autoplay` absent, `config.autoplay: false` → `play()` is **not** called. (Proves config still works as fallback.)
  - `trigger.autoplay` absent, `config.autoplay` absent → `play()` **is** called. (Proves the `true` default still holds.)

---

## Fix 2 — delete `initialPlayStates` from `useMotionProject.js`

File: `src/hooks/useMotionProject.js`.

**WRONG (current — full file):**
```js
import { useEffect, useRef, useState } from 'react';
import { productionEngine } from '../engines/ProductionEngine.js';

/**
 * React Hook to load a complete MotionPath project once.
 * Replaces the entire previous state of the productionEngine upon mount.
 * Destroys and cleans up engine resources on unmount.
 *
 * @param {Object} project - The complete project schema object
 * @param {Object} [options]
 * @param {Object} [options.initialPlayStates] - Map of timelineId → boolean,
 *   applied once at load time only (prevents a one-frame flash of motion
 *   before a separate useMotionTimelinePlayback pause can land). Changing
 *   this after mount has no effect — use useMotionTimelinePlayback for
 *   ongoing control.
 * @returns {boolean} True once the project has successfully loaded
 */
export default function useMotionProject(project, { initialPlayStates = {} } = {}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const initialPlayStatesRef = useRef(initialPlayStates);
  initialPlayStatesRef.current = initialPlayStates;

  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;
    setIsLoaded(false);

    productionEngine
      .loadProject(projectRef.current, { playStates: initialPlayStatesRef.current })
      .then(() => {
        if (!cancelled) setIsLoaded(true);
      })
      .catch(err => {
        if (!cancelled) console.error('[useMotionProject] loadProject failed:', err);
      });

    return () => {
      cancelled = true;
      productionEngine.destroy();
    };
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  return isLoaded;
}
```

**CORRECT (full file):**
```js
import { useEffect, useRef, useState } from 'react';
import { productionEngine } from '../engines/ProductionEngine.js';

/**
 * React Hook to load a complete MotionPath project once.
 * Replaces the entire previous state of the productionEngine upon mount.
 * Destroys and cleans up engine resources on unmount.
 *
 * @param {Object} project - The complete project schema object
 * @returns {boolean} True once the project has successfully loaded
 */
export default function useMotionProject(project) {
  const [isLoaded, setIsLoaded] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;
    setIsLoaded(false);

    productionEngine
      .loadProject(projectRef.current)
      .then(() => {
        if (!cancelled) setIsLoaded(true);
      })
      .catch(err => {
        if (!cancelled) console.error('[useMotionProject] loadProject failed:', err);
      });

    return () => {
      cancelled = true;
      productionEngine.destroy();
    };
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  return isLoaded;
}
```

`useMotionProject(project)` is now called with a single argument everywhere. Do not leave a second parameter of any kind, optional or not — no `options`, no `{}` default.

### Also check (don't skip): `BaseEngine.loadProject`'s `options` parameter

File: `src/engines/BaseEngine.js`. Currently `async loadProject(schema, options = {}) {` — `options` is accepted but never read anywhere in the method body. **Leave the parameter in place** (removing it could break `EditorEngine.loadProject(schema, options)`'s `super.loadProject(schema, options)` call signature, and other future callers may still want an options bag) — this brief is only removing the one specific dead consumer (`initialPlayStates`/`playStates`), not the general extension point. Do not add, remove, or rename anything in `BaseEngine.js` or `EditorEngine.js` for this brief.

### Verification checklist for Fix 2
- `grep -rn "initialPlayStates" src` returns zero matches anywhere in the codebase after this brief (including `PasarMalamPage.jsx`, fixed below).
- `grep -rn "playStates" src` returns zero matches.
- `useMotionProject.test.js` (or wherever its tests live — check first): remove/update any test that passes a second argument or asserts on `initialPlayStates`/`playStates` being forwarded to `loadProject`. Add or confirm a test that `loadProject` is called with exactly one argument (the project) — spy-based call-args assertion, not just "did it run."

---

## Fix 3 — `PasarMalamPage.jsx`, replace `initialPlayStates` with `config.autoplay`

File: `src/components/PasarMalam/PasarMalamPage.jsx`, lines ~392–397.

**WRONG (current):**
```js
  // initialPlayStates starts the bounce scenario paused to prevent a one-frame flash on load.
  // Dynamic play/pause control is handled by useMotionTimelinePlayback below.
  const isLoaded = useMotionProject(pmProject, { initialPlayStates: { 'lantern-bounce-tl': false } });
  const storytellingInstance = useMotionInstance(isLoaded ? 'pasar-malam-storytelling' : null);
  const lanternInstance = useMotionInstance(isLoaded ? 'lantern-scene' : null);
  const bounceInstance = useMotionInstance(isLoaded ? 'lantern-bounce' : null);
```

**CORRECT:**
```js
  // 'lantern-bounce' is the primary of the 'lantern-bounce-tl' group — passing
  // autoplay:false here suppresses the master timeline's initial play() call
  // at construction, so it never plays before useMotionTimelinePlayback (below)
  // takes over ongoing control. No flash, and no reliance on effect-ordering.
  const isLoaded = useMotionProject(pmProject);
  const storytellingInstance = useMotionInstance(isLoaded ? 'pasar-malam-storytelling' : null);
  const lanternInstance = useMotionInstance(isLoaded ? 'lantern-scene' : null);
  const bounceInstance = useMotionInstance(isLoaded ? 'lantern-bounce' : null, { autoplay: false });
```

Note `useMotionProject(pmProject)` — single argument, matching Fix 2. Do not pass an empty options object.

### Verification checklist for Fix 3
- `grep -n "initialPlayStates" src/components/PasarMalam/PasarMalamPage.jsx` returns zero matches.
- `grep -n "useMotionInstance(isLoaded ? 'lantern-bounce' : null, { autoplay: false })" src/components/PasarMalam/PasarMalamPage.jsx` returns exactly one match.
- Do not touch `PasarMalamObserverPage.jsx` — it uses a differently-named motion (`lantern-bounce-observer`) with no `timelineId`/`primary`/`initialPlayStates` involvement at all; out of scope, confirm with a grep that it's unaffected (`git diff` for that file should be empty).

---

## Final verification (run after all three fixes)

1. Fresh clone, `npm install`, `npx vitest run` — all tests green, and total test count should have **increased** (new autoplay-precedence tests from Fix 1), not stayed flat.
2. `grep -rn "initialPlayStates\|playStates" src` — zero matches anywhere, full repo.
3. Manual/live check (do this yourself, don't just trust the mocked tests, per this project's standing rule): load `PasarMalamPage` in a browser, confirm the lantern bounce still does not flash/play before the scroll-triggered `bouncing` state turns it on — behavior should be visually identical to before this brief, just achieved structurally instead of by timing luck.
