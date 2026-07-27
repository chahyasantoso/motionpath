# Smooth Scrolling in MotionPath

This document describes the design, problem, rationale, and implementation details for integrating smooth scrolling (using **Lenis**) into MotionPath projects at the application level.

---

## 1. The Problem

By default, desktop operating systems (specifically Windows and macOS with traditional mouse wheels) handle scroll wheel inputs in coarse, discrete intervals. A single wheel tick scrolls the page by a fixed amount (usually around `100px`).

When scrubbing a timeline using GSAP `ScrollTrigger`:

- Native scrolling makes timeline progress jump in discrete chunks (e.g., from frame 12 directly to frame 20).
- This creates visual "stepping" or "micro-stuttering" during scrollytelling animations, especially visible in high-frame-rate **Image Sequences** and fast-flying text cards.
- The scrolling animation lacks the signature fluid "inertia" or "momentum" typical of Awwwards-winning websites.

---

## 2. The Why (Decoupled Architecture)

Although smooth scrolling is highly desirable for creative web storytelling, hardcoding it directly inside the core web engine is an anti-pattern.

1. **Separation of Concerns**:
   - The engine's job is **evaluation and animation execution**: compiling project data, creating GSAP timelines, subscribing elements, and executing `gsap.set` on ticks.
   - The smooth scroll's job is **input handling and layout positioning**: intercepting mouse wheel/touch inputs and smoothly updating the document scroll offset.
   - The engine does _not_ need to be coupled to a specific smooth scroll vendor. It simply reacts to ScrollTrigger events.
2. **Platform Independence**: The core project schema (`scenarios`, `keyframes`, `stops`) is platform-agnostic. When porting the engine to mobile native frameworks like **Flutter** or **React Native**, direct touch scrolling with native inertia (`BouncingScrollPhysics`) is already hardware-accelerated and perfectly smooth. Including a smooth scroll library in the JSON schema or core engine layer would force Flutter developers to write unnecessary custom wrappers or ignore hardcoded options.
3. **Developer Choice**: Not all web layouts benefit from the same smooth scroll library. A developer might want to use **Lenis** (open source, lightweight) in one project, and **GSAP ScrollSmoother** (premium features, canvas scaling) or **Locomotive Scroll** in another.
4. **Over-smoothing / Accessibility**: Trackpad users (macOS/Windows laptops) have smooth scrolling natively built into their hardware. Adding a generic smooth scroll layer on top can create double-interpolation ("scroll lag") and cause motion sickness. Keeping the engine decoupled allows developers to disable smoothing for trackpads or users with `prefers-reduced-motion` queries.

---

## 3. The Solution: Pluggable React Hook (`useSmoothScroll`)

By handling smooth scrolling at the React application level, the engine remains 100% pure and focused solely on compiling and executing keyframes.

We expose a custom React hook: [useSmoothScroll.js](file:///d:/dev/motionpath/src/hooks/useSmoothScroll.js).

### Hook Implementation

```javascript
import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function useSmoothScroll(enabled = true, options = {}) {
  useEffect(() => {
    if (!enabled) return;

    // 1. Initialize Lenis
    const lenis = new Lenis({
      lerp: options.lerp ?? 0.1,
      ...options,
    });

    // 2. Notify ScrollTrigger on every scroll step
    lenis.on("scroll", ScrollTrigger.update);

    // 3. Link to GSAP Ticker for frame synchronization
    const updateTicker = (time) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(updateTicker);
    gsap.ticker.lagSmoothing(0);

    // 4. Cleanup on unmount
    return () => {
      lenis.destroy();
      gsap.ticker.remove(updateTicker);
    };
  }, [enabled, options.lerp]);
}
```

### Usage in Demos

To enable smooth scrolling on a specific page, simply import and call the hook at the top level of your component page:

```javascript
import useSmoothScroll from "../../hooks/useSmoothScroll";

export default function PasarMalamPage() {
  useMotionProject(pmProject);
  useSmoothScroll(); // Enables butter-smooth scrolling globally on this page

  return <div className="pm-container">...</div>;
}
```

When routing away from this page, the hook's `useEffect` cleanup automatically runs, destroying the Lenis instance and removing its tick listeners. This prevents it from interfering with scrolling on other pages.
