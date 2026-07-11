# Lantern Animation Composition: Lessons Learned

This document details the architectural findings, constraints, and solutions discovered while implementing the two-phase animation sequence (scroll-driven entry fly-in + time-driven hover bounce) for the ambient lanterns in the Pasar Malam demo.

---

## 1. The Goal
Composing two independent animation behaviors on the same visual element:
- **Phase 1 (Scroll-Scrub)**: As the user scrolls into the Pasar Malam stage, three lanterns drop down from off-screen and fade in to their starting positions.
- **Phase 2 (Time-Loop Bounce)**: Once the user scrolls past halfway (`progress >= 0.5`), the lanterns begin bouncing up and down gently in a loop. When scrolling back up, the bouncing pauses.

---

## 2. Finding 1: Element ID Collision and the Wrapper Pattern

### The Problem
Initially, we attempted to target the same element ID (`lantern-1`, `lantern-2`, `lantern-3`) in both the scroll-scrub scenario and the time-bounce scenario. This caused two major breakdowns:

1. **Proxy Overwrite**: The Engine maintains a flat map of elements (`buildResult.elements`). Because both scenarios referenced `lantern-1`, the builder registered only *one* element entry (whichever scenario processed last). The first scenario's tween was discarded in the element map.
2. **Progress Clobbering**: The ticker reads `.progress()` from the element's registered tween. Since the scroll-scrub tween was overwritten by the paused time tween, the reported progress was stuck at `0.0000` forever, preventing the threshold gate from ever crossing.
3. **CSS Style Wars**: Two independent GSAP timelines attempting to write `transform: translateY()` on the exact same DOM node will clobber each other's styles on every tick.

### The Solution: CSS Transform Composition
Rather than trying to merge or calculate complex offset mathematics inside a single subscriber, we separated the concerns using a **Wrapper/Inner DOM structure**:

```jsx
// Within the Lantern component:
return (
  <div
    ref={wrapRef}
    data-motion-id={wrapId}       /* E.g., lantern-1-wrap (Scroll) */
    className={`pm-lantern-wrap ${className}`}
  >
    <div
      ref={innerRef}
      data-motion-id={innerId}     /* E.g., lantern-1 (Time Bounce) */
      className="pm-lantern-inner"
      style={{ backgroundImage: `url('${assetUrl}')` }}
    />
  </div>
);
```

### Key Decisions
- **Scroll Trigger** targets `lantern-1-wrap`: Controls the entry `y` position and `opacity`.
- **Time Trigger** targets `lantern-1`: Controls local `y` offset bounce.
- **CSS Stacking**: The browser naturally composes parent transform translations and child transform translations. The inner element bobs relative to wherever the parent wrapper has flown to.
- **Progress Subscription**: The threshold check hooks into `lantern-1-wrap`'s progress broadcast, which behaves as a clean, scroll-only signal.

---

## 3. Finding 2: GSAP Nested Paused Timeline Lock

### The Problem
When scenarios are grouped under a single `timelineId` (e.g. `lantern-bounce-tl`), the builder aggregates them into a parent `masterTimeline`. 

At build-time, every scenario timeline is initialized with `{ paused: true }` to prevent them from executing autonomously on the global GSAP timeline:
```javascript
const scenarioTimeline = gsap.timeline({ paused: true });
```

**The Gotcha**: In GSAP, adding a child timeline that has been explicitly set to `paused: true` to a parent timeline locks that child's playhead. When the parent timeline's `.play()` method is called (e.g. via `engine.playTimer('lantern-bounce-tl')`), the child timeline ignores the parent playhead motion and remains static.

### Possible Solutions

#### Option A: Build child timelines without `paused: true`
- **Con**: Child timelines would immediately start playing on the global timeline at the moment of creation, firing animations before the engine loads the project or attaches DOM subscribers.

#### Option B: Unpause child timelines at compile/build time inside `builder.js`
- **Con**: Breaks unit tests (e.g. `builder.test.js`) that explicitly assert builder output timelines start in a paused state.

#### Option C: Unpause child timelines at wire-time inside `ProductionEngine.js` (Chosen)
- **Pro**: Keeps compilation and execution concerns completely decoupled. The builder remains pure, and runtime wiring handles playhead control.

### The Chosen Solution
Inside [`ProductionEngine.js`](file:///d:/dev/motionpath/src/lib/ProductionEngine.js#L119-L122), when a time-based group is set up, we query the master timeline's nested children and unpause them so they can follow the master timeline's playhead:

```javascript
} else if (group.triggerType === 'time') {
  // Unpause all nested child timelines so they inherit parent playhead motion
  group.masterTimeline.getChildren().forEach(child => child.paused(false));

  group.masterTimeline
    .repeat(config.repeat ?? 0)
    .yoyo(!!config.yoyo)
    .repeatDelay(config.repeatDelay ?? 0);
  const shouldPlay = options.playStates?.[timelineId] ?? true;
  if (shouldPlay) group.masterTimeline.play();
}
```

---

## 4. Key Takeaways for Future Scenarios

1. **Avoid Multi-Scenario Target Collisions**: Never target the same `id` in more than one scenario. If an element needs scroll entry and time-loop secondary action, wrap it in a container div and target the wrapper for scroll, and the child for time loop.
2. **Leverage CSS Layout Nesting**: Wrapper/Child pairing naturally resolves complex animation composition without manual math in JavaScript.
3. **Be Aware of GSAP Nesting Gotchas**: Always ensure child timelines nested within a parent timeline are not explicitly marked as paused, or ensure they are unpaused before the parent is played.
