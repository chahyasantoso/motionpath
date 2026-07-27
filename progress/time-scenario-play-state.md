# Time Scenario Play State Control

This document describes the background, problem, design alternatives, and chosen solution for declarative play/pause control of time-based animation scenarios in MotionPath.

---

## 1. Background

MotionPath projects can contain two types of scenarios:

- **Scroll scrub**: animation is driven directly by scroll position. Play state is meaningless — the timeline is always at whatever position the scroll dictates.
- **Time**: a freely-running GSAP timeline that plays forward in real time, independent of scroll. Supports `repeat`, `yoyo`, `repeatDelay` for looping animations.

Before this change, every `time` scenario was **auto-played immediately on load** inside `ProductionEngine.loadProject`. There was no way to load a scenario in a paused state and start it later.

---

## 2. The Problem

### Motivating Use Case: Triggered Looping Animation

The Pasar Malam demo has three ambient lanterns that fly in from above as the user scrolls. The desired behaviour:

1. **Phase 1 (scroll `p: 0 → 0.5`)**: Lanterns drop in and settle via scroll-scrubbed `y` and `opacity` keyframes.
2. **Phase 2 (scroll `p > 0.5`)**: Lanterns begin bouncing up and down in a gentle infinite loop, independent of scroll.

A `time` scenario with `repeat: -1, yoyo: true` is the right tool for phase 2. But it must **not** start running during phase 1 — the bounce `y` would compound on top of the scroll `y`, pulling the lantern out of position while it is still flying in.

### Motivating Use Case 2: Idle Animations on Scroll Stop

Consider a card that animates onto the screen based on scroll position. However, when the user stops scrolling (lets go of the mouse/wheel), the card should start a gentle idle float animation.

1. While **scrolling**: The card position is locked strictly to scroll-scrub progress.
2. While **idle (stopped)**: The card runs a time-looped float timeline.

Since "scroll stopping" is a dynamic event based on scroll velocity and time delays, it cannot be modeled as a static ScrollTrigger viewport boundary in the JSON schema. It requires:

- Dynamic scroll event debounce or velocity measurement at runtime.
- Communicating this dynamic state to the engine (e.g. `useMotionProject(project, { 'card-idle-tl': !scrolling })`).

This scenario demonstrates why runtime engine-level play/pause state control is not just convenient, but a **strict requirement** for advanced scroll composition.

### Why the Existing API Was Insufficient

`ProductionEngine` already exposed `playTimer(id)` and `pauseTimer(id)` methods, but:

1. `useMotionProject` returned nothing — no handle back to the caller.
2. Calling `productionEngine` directly from a component imports the singleton by name, bypassing the hook abstraction and making the component untestable with mocked engines.
3. Calling `engine.playTimer(id)` from inside a GSAP subscriber callback (which fires outside React's render cycle) is imperative, not declarative — the state is invisible to React and cannot be inspected or tested via standard React testing tools.

---

## 3. Design Alternatives Considered

### Option A: `paused` flag in the schema

```json
{ "type": "time", "repeat": -1, "yoyo": true, "paused": true }
```

**Rejected** — the schema describes _what_ to animate, not _when_ to start. Play state is a runtime/application concern, not an animation definition concern. Adding `paused` to the schema would pollute the schema with control flow logic that belongs in the React layer.

### Option B: Return the engine handle from `useMotionProject`

```javascript
const engine = useMotionProject(pmProject);
engine.playTimer("lantern-bounce-tl");
```

**Partially useful** — gives components access to `playTimer/pauseTimer`. But it's still imperative: the caller has to manage when to call them and the state is invisible to React. Not rejected entirely — could be added later for advanced use cases.

### Option C: `setState` + `useEffect` chain (Chosen)

```javascript
const [bouncing, setBouncing] = useState(false);
useMotionProject(pmProject, { "lantern-bounce-tl": bouncing });
```

React state is the source of truth. When `bouncing` changes, a `useEffect` inside `useMotionProject` fires and calls `playTimer`/`pauseTimer`. This is:

- **Declarative**: the intention is expressed as state, not as an imperative call.
- **React-idiomatic**: state is visible to DevTools, testable with `renderHook`, and batched correctly.
- **Decoupled**: the component never imports or calls engine methods directly.

---

## 4. The Solution

### 4.1 `ProductionEngine.loadProject(schema, options)`

`loadProject` now accepts an optional second argument:

```javascript
productionEngine.loadProject(schema, {
  playStates: {
    "lantern-bounce-tl": false, // false = build but do NOT call .play()
  },
});
```

When wiring `time` triggers, the engine checks `options.playStates`:

```javascript
const stateKey = timelineId ?? String(scenario.scenarioIndex);
const shouldPlay = options.playStates?.[stateKey] ?? true; // default: auto-play
if (shouldPlay) scenario.timeline.play();
```

- `true` or absent → `.play()` called immediately (original behaviour, no regression)
- `false` → timeline is built, scrub is configured, but `.play()` is skipped

### 4.2 `useMotionProject(project, playStates)`

The hook accepts a second parameter and contains **two independent `useEffect`s**:

```javascript
export default function useMotionProject(project, playStates = {}) {
  // Stable serialised dep — avoids object-reference churn
  const playStatesKey = Object.entries(playStates)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(',');

  // Effect 1: Load — dep: [project]
  // Rebuilds the entire engine when the schema changes.
  // Forwards the initial playStates so paused-on-load is respected from frame 0.
  useEffect(() => {
    productionEngine.loadProject(project, { playStates }).catch(...);
    return () => productionEngine.destroy();
  }, [project]);

  // Effect 2: Play state — dep: [playStatesKey]
  // Calls playTimer/pauseTimer when playStates values change.
  // NEVER triggers a project reload.
  useEffect(() => {
    for (const [id, playing] of Object.entries(playStates)) {
      try {
        if (playing) productionEngine.playTimer(id);
        else         productionEngine.pauseTimer(id);
      } catch {
        // Engine not yet ready — initial state is handled by Effect 1 above
      }
    }
  }, [playStatesKey]);
}
```

**Why two effects?** If both lived in one effect with `[project, playStatesKey]` as deps, changing `bouncing` would re-trigger `loadProject` — rebuilding all tweens, destroying existing animations, and causing a visible flash. The separation is intentional and critical.

### 4.3 Component Usage (Pasar Malam Demo)

```javascript
export default function PasarMalamPage() {
  const [bouncing, setBouncing] = useState(false);
  const bouncingRef = useRef(false); // prevents per-tick setState

  // playStates: false → bounce scenario starts paused
  // When bouncing flips to true → Effect 2 fires → engine.playTimer('lantern-bounce-tl')
  useMotionProject(pmProject, { "lantern-bounce-tl": bouncing });

  // Threshold gate: reads scroll progress from lantern-1's subscriber
  const lanternProgressRef = useRef(null);
  const onScrollProgress = useCallback((rawData) => {
    const should = rawData.progress >= 0.5;
    if (should !== bouncingRef.current) {
      bouncingRef.current = should;
      setBouncing(should); // fires only at threshold crossings
    }
    return {}; // pure progress observer — no style patch
  }, []);

  useMotionSubscriber("lantern-1", lanternProgressRef, onScrollProgress);
  // ...
}
```

### 4.4 Lantern Bounce Scenario Schema

```javascript
const lanternBounceScene = {
  sceneId: "lantern-bounce",
  timelineId: "lantern-bounce-tl", // addressable id for playStates
  primary: true,
  trigger: { type: "time", repeat: -1, yoyo: true },
  elements: [
    {
      id: "lantern-1",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -18, ease: "power1.inOut" },
          ],
        },
      },
    },
    {
      id: "lantern-2",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -12, ease: "power1.inOut" },
          ],
        },
      },
    },
    {
      id: "lantern-3",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -20, ease: "power1.inOut" },
          ],
        },
      },
    },
  ],
};
```

Each lantern has a different `y` amplitude (`-18`, `-12`, `-20`) so they bob at different heights and appear organic. The `yoyo: true` on the trigger makes GSAP reverse the timeline automatically, producing the up-down oscillation without needing extra stops.

---

## 5. Edge Cases

### Race: `playStates` set before `loadProject` resolves

`loadProject` is async (it calls `buildProject` which may await). If `bouncing` is already `true` when the component mounts, Effect 2 fires before the engine is ready and `playTimer` throws. The `try/catch` swallows this — Effect 1 forwards the same `playStates` to `loadProject`, so the scenario is initialised in the correct state from frame 0.

### Scroll backward past threshold

When the user scrolls back past `p = 0.5`, `onScrollProgress` sets `bouncing = false`. Effect 2 fires and calls `engine.pauseTimer('lantern-bounce-tl')`. GSAP `pause()` freezes the timeline at its current position — it does not reset to `p = 0`. When the user scrolls forward again and `bouncing` returns to `true`, `engine.playTimer` resumes from where it left off, which is the desired behaviour.

### Multiple `playStates` keys

The `playStatesKey` serialisation sorts entries before joining, so `{ a: true, b: false }` and `{ b: false, a: true }` produce the same key and do not cause unnecessary Effect 2 re-runs.

### GSAP Nesting Gotcha (Paused Child Timelines)

At build time, the builder creates all scenario timelines as `paused: true` to prevent automatic playback. However, when these timelines are grouped under a `timelineId` inside a `masterTimeline`, GSAP maintains the child's `paused` state individually.

If a child timeline remains `paused`, calling `.play()` on its parent `masterTimeline` has no effect on the child. To resolve this, during the wiring stage in `ProductionEngine.js`, we programmatically unpause child timelines inside time-based groups so they can respond to the parent's playhead:

```javascript
group.masterTimeline.getChildren().forEach((child) => child.paused(false));
```

---

## 6. Files Changed

| File                                                                                               | Change                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [ProductionEngine.js](file:///d:/dev/motionpath/src/lib/ProductionEngine.js)                       | `loadProject(schema, options)` — respects `options.playStates` for time scenarios |
| [useMotionProject.js](file:///d:/dev/motionpath/src/hooks/useMotionProject.js)                     | Accepts `playStates` second arg; two independent effects                          |
| [ProductionEngine.test.js](file:///d:/dev/motionpath/src/lib/__tests__/ProductionEngine.test.js)   | 2 new tests: auto-play default, paused-on-load                                    |
| [useMotionProject.test.js](file:///d:/dev/motionpath/src/hooks/__tests__/useMotionProject.test.js) | 4 new tests: initial forwarding, play, pause, project-change isolation            |
| [PasarMalamPage.jsx](file:///d:/dev/motionpath/src/components/PasarMalam/PasarMalamPage.jsx)       | `lanternBounceScene` + `useState` wiring + `onScrollProgress` threshold gate      |
