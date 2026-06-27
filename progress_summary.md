# Progress Summary — Modularization & 3D Z-Depth scaling Demo

This document summarizes the changes made to the codebase to allow future agents to quickly resume context without re-reading the entire history.

---

## 1. Key Accomplishments

### A. Modularized the Motion Engine
*   **Goal**: Prune the over 500-line `motionEngine.js` file and isolate helper functions.
*   **Result**: Created [`pathUtils.js`](file:///d:/dev/motionpath/src/lib/pathUtils.js) to host pure geometry calculations (`buildMotionPath`, `convertToCubicPath`, `getPointOnCubicPath`, `getPointOnPath`). Imported them back to [`motionEngine.js`](file:///d:/dev/motionpath/src/lib/motionEngine.js) which is now focused solely on scene orchestration (saving ~180 lines).
*   **Tests**: Created [`pathUtils.test.js`](file:///d:/dev/motionpath/src/lib/__tests__/pathUtils.test.js) and pruned standalone tests from [`motionEngine.test.js`](file:///d:/dev/motionpath/src/lib/__tests__/motionEngine.test.js).

### B. Implemented Tilted 3D Z-Depth scaling Demo
*   **Goal**: Create a demo showing native 3D depth scaling (card growth/shrinkage) where the start and end coordinates have the same X/Y positions but different Z positions.
*   **Path Setup**: Defined a tilted 3D curved Bezier trajectory:
    `{-150, -120, -300} -> {150, 120, 300, ctrlX: 100, ctrlY: -100, ctrlZ: 0} -> {-150, -120, -300, ctrlX: -100, ctrlY: 100, ctrlZ: 0}`
*   **Zero Re-renders**: Subscriber component updates the card transform natively via GSAP and updates text readouts directly in the DOM using refs.
*   **Unified Projection Math**: Updated `project3DTo2D` and `projectPathNodes3DTo2D` in [`projection3d.js`](file:///d:/dev/motionpath/src/lib/projection3d.js) to support perspective division scaling natively:
    $$\text{scale} = \frac{\text{perspective}}{\text{perspective} - Z}$$
    $$X_{2D} = C_X + X_{3D} \times \text{scale}$$
    $$Y_{2D} = C_Y + Y_{\text{projected}} \times \text{scale}$$
*   **Single Source of Truth**: Defined `PERSPECTIVE = 1000` inside `GrowthDemo` and injected it as an inline style on the stage:
    `style={{ perspective: `${PERSPECTIVE}px` }}`
    This ensures that browser-native 3D transforms (`translate3d(x,y,z)`) and JS projected dotted SVG guides match up pixel-perfectly without duplicating constants in CSS.

### C. Added Timeframe Support for Staggered Sequencing
*   **Goal**: Add support for a `timeframe` property (`[startFraction, endFraction]`) to both scroll-driven and timer-driven scenes to enable staggered animations and cinematic sequencing.
*   **Result**: 
    *   Updated the motion engine ([`motionEngine.js`](file:///d:/dev/motionpath/src/lib/motionEngine.js)) to compute tween offsets and durations based on the timeframe.
    *   For scroll scenes, tweens are positioned at `startTime` on a normalized `[0, 1]` timeline duration. A dummy label `tl.addLabel('end', 1)` keeps the master timeline duration at exactly `1.0`.
    *   For timer scenes, delay and duration are dynamically adjusted relative to the element's base duration (e.g. `duration = baseDuration * (end - start)` and `delay = baseDelay + baseDuration * start`).
    *   Documented the property in [`schema.md`](file:///d:/dev/motionpath/schema.md).
    *   Refactored the Strawberry burst demo in [`App.jsx`](file:///d:/dev/motionpath/src/App.jsx) to launch strawberries sequentially using custom timeframes, fading in and out using local timeline progress.

### D. Resolved 3D Perspective Projection Drift for Editor Guides
*   **Goal**: Align SVG guide paths, node handles, and control points in the Interactive Path Editor with elements when their Z depth $Z \ne 0$.
*   **The Cause**: The browser natively perspective-projects translated elements (e.g. centerpiece ice cream at $Z = 400$) using the parent's CSS `perspective` and `perspectiveOrigin`, but the editor's SVG paths and handles were rendered as flat 2D elements in raw coordinates.
*   **Result**: 
    *   Updated [`EditorCanvas.jsx`](file:///d:/dev/motionpath/src/components/Editor/EditorCanvas.jsx) to parse dynamic parent perspective values (`perspectiveVal = parseFloat(style.perspective) || 1000`).
    *   Defined a `projectPoint` helper that projects raw 3D coordinates $(X,Y,Z)$ into 2D canvas coordinates using the parsed perspective properties.
    *   Projected paths, node handles, control guides, tangent lines, extrusion guides, and fallback preview items.
    *   Updated `handlePointerMove` to dynamically reverse the 3D perspective projection during drags using the correct perspective values, eliminating node jumps when clicking/dragging.
    *   Anchored `.editor-preview-item` at `top: 0; left: 0` in [`App.css`](file:///d:/dev/motionpath/src/App.css) to establish a clean coordinate baseline.

---

## 2. Verification

*   All **62 unit tests** in `vitest` pass successfully.
*   Run the test runner at any time using:
    ```bash
    npm run test
    ```

---

## 3. Future Roadmap: Path Editor Design Brainstorm

We brainstormed the design of the interactive Path Editor for web section animations, aligning on a **Flat Vector Canvas with Depth Overlay (Hybrid)** approach:

### Core Concepts
1.  **Context-Aware Overlay Canvas**:
    *   The editor canvas acts as a transparent overlay directly on top of the actual website layout.
    *   Users draw motion paths using a standard **Pen Tool** (clicking nodes, dragging control handles) directly matching Webflow, Figma, or Illustrator. This represents $X$ and $Y$ layout mapping.
2.  **Opt-in 3D Z-Depth Handles**:
    *   Instead of a cluttered 3D camera orbit that distorts text readability, the layout canvas remains flat.
    *   When a node is selected, a dedicated **Z-Depth slider or helper handle** is rendered next to the node (or updated via modifier key drags e.g. `Ctrl + drag`).
    *   Modifying the Z-depth natively scales/blurs the test card and shifts the projected SVG guide line in real-time, giving immediate depth cues while keeping the page readable.
3.  **Responsive Layout Scaling**:
    *   Since paths are drawn directly over the website section grid, coordinate parameters can be exported in percentages or viewport units (`%`, `vw`, `vh`) for fully responsive 3D animations across devices.
