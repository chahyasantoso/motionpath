# Progress Summary — Project Migration & Engine Redesign

This document chronicles the complete journey of migrating the React Motion Path project to a locked declarative JSON schema, redesigning the core animation engine, and separating scrollytelling demos into modular page components.

---

## 1. Key Accomplishments

### A. Modularized the Motion Engine & Geometry Core
*   **Goal**: Prune the over 500-line monolithic `motionEngine.js` file and isolate helper functions.
*   **Result**: 
    *   Created [`pathUtils.js`](file:///d:/dev/motionpath/src/lib/pathUtils.js) to host pure geometry calculations (`buildMotionPath`, `convertToCubicPath`, `getPointOnCubicPath`, `getPointOnPath`).
    *   Imported them back to [`motionEngine.js`](file:///d:/dev/motionpath/src/lib/motionEngine.js), reducing its size and focusing it purely on scene orchestration.
    *   Created [`pathUtils.test.js`](file:///d:/dev/motionpath/src/lib/__tests__/pathUtils.test.js) and pruned standalone tests from [`motionEngine.test.js`](file:///d:/dev/motionpath/src/lib/__tests__/motionEngine.test.js).

### B. Declarative JSON Schema Overhaul (Locked Schema)
*   **Goal**: Replace the flat, path-only `triggerType` representation with a locked, data-first project-level configuration.
*   **Specification**:
    *   **Top Level**: Configured `projectId`, `perspective`, and `scenarios[]` array.
    *   **Scenarios**: Structured as groups having a single trigger definition (`type: "scroll" | "time"`), optional `stagger`, and an array of `elements`.
    *   **Elements**: Defined by `id`, optional `duration`, `transformOrigin`, `direction` override, and flat keyframe mappings.
    *   **Keyframes**: Map keys directly to animatable properties.
    *   **Stops**: Multi-step interpolation format: `{ p: progress (0-1), v: value (number|string), ease: easeName }`.
*   **Validation Layer**: Created [`validateScenario.js`](file:///d:/dev/motionpath/src/lib/validateScenario.js) to assert schema integrity before GSAP construction, catching ease collisions, mutual exclusivity between path and coordinates, invalid trigger fields, and direction ambiguities.

### C. Polymorphic Engine Redesign (`GsapPubSub`)
*   **Goal**: Rebuild the core animation engine to construct GSAP timelines directly from the new declarative stops schema.
*   **Plugin Architecture**: 
    *   Split animatable keys into **Core Plugins** (`position`, `transform`, `opacity`, `filter`, `color`, `cssVar`, `path`) and **Lazy Plugins** (`splitText`, `morphSVG`, `drawSVG`, `scrambleText`).
    *   Plugins implement a contract: `keys`, `contribute(stops, elementCfg, propKey)` (yields percentage-tween objects), and `compose(proxyState)` (combines raw variables into DOM-ready styles).
*   **Tween Aggregation**: Merged all property contributions per element into a unified percentage-keyframe timeline (`"0%"`, `"50%"`, etc.), building a single `gsap.to()` per element to prevent layout thrashing.
*   **Double-Pass Compositing (Filter Consolidation)**: Implemented an internal proxy map (`__blur`, `__brightness`, etc.) where filter components contribute separately. The consolidated filter plugin runs a second composition pass, combining them into a single CSS `filter` string (e.g. `blur(...) brightness(...)`) to prevent collisions.
*   **Accurate Bezier Pacing (Dropped MotionPathPlugin)**: Discovered that GSAP's native `MotionPathPlugin` ignores custom segment timeline pacing (yielding speed drifts). Replaced it with path stops mapping to a virtual `__pathProgress` property. The path plugin's `compose()` calls `getPointOnCubicPath()` internally to compute accurate 3D coordinates and tangent angles, guaranteeing speed-aligned pacing.
*   **Dynamic Stagger Support**: Implemented scenario-level staggering that automatically calculates and adjusts GSAP timeline offsets for each element.

### D. Scenario Trigger Systems (Scroll & Time)
*   **Goal**: Build native, high-performance triggers matching the three design patterns.
*   **Scroll-Scrub**: Binds timeline progress directly to scroll distance. Configured with native GSAP ScrollTrigger features (`scrub`, `pin`, `pinSpacing`, `snap`, and custom boundary markers).
*   **Scroll-Observer (Non-Scrub)**: Triggers autonomous playback when entering viewport boundaries, utilizing GSAP's native `toggleActions` dispatch.
*   **Time-Driven**: Drives timelines continuously via time-based configurations (`duration`, `repeat`, `yoyo`, `repeatDelay`).

### E. Tilted 3D Z-Depth Scaling & Auto-Alignment
*   **Goal**: Implement perspective-division math and auto-alignment to eliminate boilerplate in UI components.
*   **Perspective Math**: Updated `project3DTo2D` and `projectPathNodes3DTo2D` in [`projection3d.js`](file:///d:/dev/motionpath/src/lib/projection3d.js) to support division scaling:
    $$\text{scale} = \frac{\text{perspective}}{\text{perspective} - Z}$$
*   **Auto-Alignment**: Configured the composition pipeline to automatically parse `transformOrigin` and compute/inject `xPercent` and `yPercent` into the style patch. This keeps elements centered perfectly over their trajectory nodes by default.

### F. Dynamic Engine-Level Stagger in DemoPage
*   **Goal**: Refactor the Carousel and Helix animations in `DemoPage.jsx` to utilize the engine's declarative `stagger` setting instead of manual React component Javascript offset calculations.
*   **Result**: 
    *   Removed index-based offset calculations (`index * cardSpacing`) and total offset span math from `CarouselCard` and `HelixCard` hooks.
    *   Updated `DemoPage.jsx` to build scenarios dynamically using `useMemo` based on array lengths, registering card elements with unique IDs.
    *   Configured the scene staggers (`stagger: { each: 0.14 }` for Carousel and `stagger: { each: 0.16 }` for Helix) inside the scenario definitions.
    *   Subscribers bind directly to their unique element IDs, obtaining staggered `__pathProgress` natively from the engine.
    *   Migrated CarouselCard opacity fade transitions to declarative keyframe stops inside the JSON schema.
    *   Aligned 3D stage perspectives to use a single project-level configuration `PROJECT_CONFIG.perspective` (1000px), applied inline on container divs and to child cards.

---

## 2. Page Extraction & App Routing

### A. Sandbox Extraction
*   **Goal**: Split the massive scrollytelling experiments out of the main landing view and enable a clean router structure.
*   **Demos Isolated**:
    *   Created [DemoPage.jsx](file:///d:/dev/motionpath/src/components/Demo/DemoPage.jsx) and [DemoPage.css](file:///d:/dev/motionpath/src/components/Demo/DemoPage.css) to isolate Scroll, Carousel, and Helix card showcases.
    *   Created [BurstPage.jsx](file:///d:/dev/motionpath/src/BurstPage.jsx) and [BurstPage.css](file:///d:/dev/motionpath/src/BurstPage.css) to isolate the Strawberry Burst scrollytelling timeline.
*   **Unified Router**: Configured [App.jsx](file:///d:/dev/motionpath/src/App.jsx) as a React Router shell mapping paths for `/` (PathEditor), `/demo` (DemoPage), and `/burst` (BurstPage).

---

## 3. Stability & Bug Fixes

*   **Autonomous Playback Glitch**: Fixed a bug where scroll-scrub timelines would play automatically on load. Added explicit `triggerType` tracking (`'scroll-scrub' | 'scroll-observer' | 'time'`), ensuring playheads stay fixed to the scrollbar for scrub scenes.
*   **Resize Scrambling**: Solved canvas resize layout offsets. Disabled ScrollTrigger during editor sessions (forcing manual progress scrubbing) and registered a `ResizeObserver` notifying the canvas parent to project coordinates instantly.
*   **Timer Resetting**: Prevented coordinates modification from restarting timer scenes. Mounted `motionEngine.isEditorMode = true` to force all timeline structures to render as static scrubbable sequences inside the playground.

---

## 4. Verification

*   All **82 unit tests** in `vitest` pass successfully.
*   Test suite verifies: path utilities, 3D projections, code parsers, hooks lifecycle, auto-direction, stagger offsets, and autoRotate behaviors.
*   Run the test runner:
    ```bash
    npm run test
    ```
