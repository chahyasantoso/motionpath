# Idle Animation Solutions in Scrollytelling

This document outlines the problem, design patterns, and alternative technical solutions for executing **idle animations**—animations that scrub with scroll position when the user is active, but transition into a looping time-based animation when scrolling stops.

---

## 1. The Core Problem

In advanced scrollytelling, we often want elements to feel "alive" even when the user is not actively scrolling:

- A card slides onto the screen on scroll. When scroll stops, it starts a gentle floating, rotating, or pulsing loop.
- A character walks along a path on scroll. When scroll stops, they transition into an idle breathing or looking-around cycle.

To accomplish this, we must solve two distinct problems:

1. **Property Collision**: Preventing the scroll-scrub timeline and the time-loop timeline from competing for the same CSS property (e.g. `translateY` or `rotation`) at the same time.
2. **State Detection**: Detecting when the scroll has stopped (velocity becomes zero) and communicating that event to the rendering target.

---

## 2. Architecture Prerequisite: The Wrapper/Inner Pattern

Regardless of the trigger mechanism used, two active GSAP timelines writing to the same CSS property on the same DOM element will fight and clobber each other. To avoid this, **never target the same element ID across both scenarios**.

Use a nested DOM structure to separate the animation axes:

```html
<!-- Wrapper element: Driven by Scroll Scenario (e.g. entry slide-in) -->
<div data-motion-id="card-wrap" class="card-wrap">
  <!-- Inner element: Driven by Time Scenario (e.g. idle float loop) -->
  <div data-motion-id="card-inner" class="card-inner">Card Content</div>
</div>
```

---

## 3. Alternative Solutions

### Option 1: Stateful React Hook + `playStates` API (Implemented)

This approach uses standard React state to capture scroll activity and feeds it back into the engine using the second argument of `useMotionProject`.

#### Implementation

```jsx
import { useEffect, useState, useRef } from "react";

export default function MyComponent() {
  const [scrolling, setScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolling(true);
      clearTimeout(scrollTimeoutRef.current);
      // Let go threshold
      scrollTimeoutRef.current = setTimeout(() => setScrolling(false), 150);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // When scrolling stops, playStates maps 'card-idle-tl' to true
  useMotionProject(projectSchema, {
    "card-idle-tl": !scrolling,
  });

  // ...
}
```

- **Pros**: Standard React paradigm, full support for all engine features (custom plugins, complex paths), no engine core updates required.
- **Cons**: Triggers React component re-renders when state toggles.

---

### Option 2: Pure CSS Class Toggling (Hybrid Approach)

This approach handles the scroll-scrub entry via the MotionPath engine, but delegates the idle animation to a native CSS animation whose playback state is toggled by a simple body class.

#### Implementation

**JavaScript:**

```javascript
let scrollTimeout;
window.addEventListener("scroll", () => {
  document.body.classList.add("is-scrolling");
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    document.body.classList.remove("is-scrolling");
  }, 150);
});
```

**CSS:**

```css
.card-inner {
  animation: gentle-float 3s infinite ease-in-out alternate;
  animation-play-state: running; /* Plays when scroll stops */
}

/* Pause the animation immediately when scrolling starts */
body.is-scrolling .card-inner {
  animation-play-state: paused;
}
```

- **Pros**: Sub-millisecond performance (handled entirely by the browser's compositor thread), zero React re-renders, extremely low code footprint.
- **Cons**: Locked to standard CSS animations (no custom engine plugins, SVG morphing, or complex path-following supported).

---

### Option 3: Schema-Driven Engine Observers (Proposed Declarative Feature)

This approach adds native scroll activity detection to the engine's core, allowing developers to declare the idle behavior entirely in JSON without writing any JS or React code.

#### Proposed Schema

```json
{
  "sceneId": "card-idle-scene",
  "trigger": {
    "type": "time",
    "activeOn": "scroll-idle",  // New trigger configuration key
    "repeat": -1,
    "yoyo": true
  },
  "elements": [...]
}
```

#### Engine Support (Conceptual)

```javascript
// Inside ProductionEngine.js loadProject:
let scrollTimeout;
const idleTimelines = []; // collect scenarios with activeOn: 'scroll-idle'

window.addEventListener("scroll", () => {
  // Pause all idle timelines instantly when scroll starts
  idleTimelines.forEach((tl) => tl.pause());

  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    // Play idle timelines when scroll ceases
    idleTimelines.forEach((tl) => tl.play());
  }, 150);
});
```

- **Pros**: 100% declarative, zero component-level code, high reusability.
- **Cons**: Adds scrolling event-listener dependencies directly to the core animation engine bundle.

---

### Option 4: Velocity-Based Speed Scaling (`timeScale`)

Instead of hard-cutting between playing and paused states, this approach dynamically scales the speed (`timeScale`) of the GSAP idle timeline to match the inverse of the scroll velocity.

#### Implementation

```javascript
// Listen to Lenis scroll velocity or compute manually
lenis.on("scroll", ({ velocity }) => {
  const targetScale = Math.max(0, 1 - Math.abs(velocity) * 0.5);

  // Smoothly transition the speed of the idle animation to avoid jarring jumps
  gsap.to(idleTimeline, {
    timeScale: targetScale,
    duration: 0.4,
    ease: "power2.out",
  });
});
```

- **Pros**: Unmatched visual premium quality. The idle loop gradually winds down as the user scrolls, and gently picks back up when they stop.
- **Cons**: Requires continuous scroll tracking and a direct imperative handle to the timeline instance.

---

## 4. Possible Chosen Solution: Native Engine-Level Velocity Scaling

If we were to expand the MotionPath engine to support this natively, we would design it as a declarative schema parameter. This would fully support **complex timelines** (such as path-following, SVG morphing, and custom plugins) because the speed scaling is applied directly to standard engine-generated GSAP timelines.

### Proposed Schema Extension

We add a `velocityScale` parameter inside the time-based scenario trigger config:

```json
{
  "sceneId": "complex-idle-path",
  "timelineId": "idle-path-tl",
  "trigger": {
    "type": "time",
    "repeat": -1,
    "yoyo": true,
    "velocityScale": {
      "sensitivity": 0.002,
      "damping": 0.4,
      "mode": "inverse"
    }
  },
  "elements": [
    {
      "id": "hovering-card",
      "keyframes": {
        "path": {
          "points": [
            { "x": 0, "y": 0 },
            { "x": 100, "y": 50, "ctrlX": 50, "ctrlY": -20 },
            { "x": 0, "y": 0, "ctrlX": 50, "ctrlY": 70 }
          ],
          "stops": [
            { "p": 0, "v": 0 },
            { "p": 1, "v": 1 }
          ],
          "autoRotate": true
        }
      }
    }
  ]
}
```

### Proposed Engine Integration

1. **Low-overhead Velocity Readings**: Rather than adding custom event listeners, `ProductionEngine.js` will query `ScrollTrigger.getVelocity()` inside the existing GSAP ticker loop.
2. **Timeline Target Identification**: During project load, scenarios carrying `velocityScale` are collected.
3. **Speed Interpolation**: The ticker loop updates the master timeline's speed:
   ```javascript
   const velocity = ScrollTrigger.getVelocity();
   const targetScale = Math.max(0, 1 - Math.abs(velocity) * sensitivity);

   gsap.to(group.masterTimeline, {
     timeScale: targetScale,
     duration: damping,
     overwrite: "auto",
   });
   ```

### Why it supports Complex Animations (Paths, Morphing, etc.)

Because the engine controls the speed by modifying the timeline's **`timeScale`** (which scales the rate at which time passes on the GSAP timeline), the underlying animation features remain completely untouched:

- **Path Tweens**: The element will still trace the exact Bezier path waypoints correctly, orienting to path tangents with `autoRotate`. Its movement speed along the path simply dials down to a stop when scrolling.
- **Custom Plugins**: CSS variables, filter combinations, and SVG morphs will update frame-by-frame normally.
- **GSAP Eases**: Any keyframe eases (`power2.inOut`, `back.out`, etc.) are respected; they are merely stretched or compressed in time.

---

## 5. Comparison Summary

| Criteria                 | Option 1: React State  | Option 2: CSS Hybrid       | Option 3: Schema Observer   | Option 4 (Adopted): Engine Velocity Scaling |
| ------------------------ | ---------------------- | -------------------------- | --------------------------- | ------------------------------------------- |
| **Component Code**       | Medium (state + hooks) | Low (class toggle)         | **Zero**                    | **Zero**                                    |
| **Animation Richness**   | **High** (GSAP Engine) | Low (CSS Keyframes)        | **High** (GSAP Engine)      | **High** (Paths/Plugins/Eases)              |
| **Performance**          | Good                   | **Excellent** (Compositor) | Good                        | Good                                        |
| **Visual Fluidity**      | Abrupt start/stop      | Abrupt start/stop          | Abrupt start/stop           | **Perfect** (Smooth deceleration)           |
| **Architectural Purity** | Good                   | Decoupled                  | **Best** (Declarative JSON) | **Best** (Declarative JSON)                 |
