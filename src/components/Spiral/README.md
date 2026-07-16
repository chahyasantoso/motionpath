# Zuma Spiral Flow

An endless Zuma-style wave-spawner demo showcasing parent-child timeline nesting, native GSAP stagger reflow, and high-performance DOM transformations using the MotionPath Engine.

---

## 📖 Table of Contents
1. [Architecture & Flow](#-architecture--flow)
2. [Uniform Path Geometry](#-uniform-path-geometry)
3. [Linear Speed Progression](#-linear-speed-progression)
4. [Wave-Based Game Loop (rAF)](#-wave-based-game-loop-raf)
5. [Wave Reset & Playhead Re-anchoring](#-wave-reset--playhead-re-anchoring)
6. [Declarative Sizing Schema](#-declarative-sizing-schema)

---

## 🏗️ Architecture & Flow

The Zuma Spiral utilizes a parent-child timeline structure to achieve smooth and mathematically perfect ball queue management:

```mermaid
graph TD
    ParentTimeline[parent-container timeline] -->|Controls Playhead| Child1[spiral-zuma child 1]
    ParentTimeline -->|Controls Playhead| Child2[spiral-zuma child 2]
    ParentTimeline -->|Controls Playhead| Child3[spiral-zuma child 3]
    
    Child1 -->|onComplete Event| GC[Garbage Collector: handleAutoRemove]
    Child2 -->|onComplete Event| GC
    Child3 -->|onComplete Event| GC
    
    RAF[requestAnimationFrame loop] -->|Checks spacing & progress| Spawner[Spawner]
    RAF -->|children.length === 0| ResetWave[Reset Wave & parent.play0]
```

---

## 📐 Uniform Path Geometry

An Archimedean spiral has a radius $r$ that decreases linearly with the angle $\theta$:
$$r(\theta) = R_{\text{outer}} - k \theta$$

By default, generating coordinates at linear angular steps ($\Delta \theta$) causes points to cluster tightly near the center and stretch wide at the outer edge, making constant-speed propagation impossible.

To fix this:
1. A high-resolution raw spiral of $2,000$ points is generated.
2. The cumulative physical distance (arc length) is measured segment-by-segment.
3. The path is re-sampled to create exactly $200$ uniform segments where the distance between any two adjacent coordinates is a constant step size of $\approx 20.5\text{px}$.

---

## 🏃 Linear Speed Progression

By default, GSAP applies a decelerating ease (`power1.out`) to keyframe interpolations. In a Zuma game, this deceleration makes balls cluster and overlap at the start of the path.

To keep speed constant along the path without modifying the engine library, we set `ease: 'none'` directly inside the track schema stops configuration:

```javascript
      path: {
        points: spiralPathPoints,
        stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: 'none' }],
      }
```

This enforces a perfectly linear progression:
$$\text{distance}(t) = v \cdot t$$
This allows us to accurately infer the progress checks (`MIN_SPAWN_PROGRESS`) and stagger delay intervals directly from the physical size of the balls.

---

## 🔄 Wave-Based Game Loop (rAF)

The spawner runs on a native browser `requestAnimationFrame` paint loop, clean of React state renders.

### 1. Spawning (The Spawner)
* **Goal**: Launch balls in a tight, touching chain from the outer tip of the spiral.
* **Logic**: Only spawns if the count of balls launched in the current wave is less than $30$. Spawns a new ball if no preceding ball exists, or if the last launched ball has progressed past the center-to-center spacing threshold:
  $$\text{MIN\_SPAWN\_PROGRESS} = \frac{\text{BALL\_SIZE}}{\text{totalPathLength}}$$

### 2. Event-Driven Unspawning (The Garbage Collector)
* **Goal**: Safely clean up and destroy entities that enter the black hole.
* **Mechanism**: On-complete events are fully reliable due to the engine's correct playhead sync and predecessor-anchored spawn placement (which avoids cascade reflow drift). When a ball finishes its path, its event-driven `onComplete` callback fires immediately, triggering `handleAutoRemove(id, inst)` to remove the ball from React state and invoke `containerInstance.removeChild(inst)`.

---

## 🔄 Wave Reset & Playhead Re-anchoring

Wave resets are evaluated directly inside the spawner's tick loop when spawning completes:

```javascript
    const handleSpawningNewBalls = () => {
      if (spawnedCount.current < 30) {
        // Spawning logic...
      } else if (containerInstance.children.length === 0) {
        spawnedCount.current = 0;
        containerInstance.timeline.play(0);
      }
    };
```

* When all balls are cleared (popped by clicks or swallowed by the black hole), `children.length` becomes `0`.
* The tick loop detects this, resets `spawnedCount.current` to `0`, and forces the parent timeline back to time `0` using `.play(0)`.
* Replaying from `0` is critical because GSAP completes and pauses the parent timeline at the end of a wave; calling `.play(0)` resumes the playhead so that the next wave's balls play correctly from the outer edge.

---

## 📐 Declarative Sizing Schema

Sizing is completely decoupled from inline React styles and CSS class lookups by using a declarative `--ball-size` CSS variable track in the motion schemas:

```javascript
      '--ball-size': {
        stops: [
          { p: 0, v: `${BALL_SIZE}px` },
          { p: 1, v: `${BALL_SIZE}px` }
        ]
      }
```

The engine's native `cssVarPlugin` automatically captures this variable, composes the patch, and applies it straight to the DOM ref. This variable is registered in both `spiralZumaScene` and `ballExitScene` to ensure the ball preserves its correct size when transitioning into pop animations.
