# SCHEMA.md — MotionPath JSON Project Schema

All animation data must follow this schema. File extension: `.json`.

---

## Top-Level Project Object

```typescript
interface MotionProject {
  projectId: string;
  perspective?: number;   // CSS perspective in px for 3D scenes (e.g. 1000)
  scenarios: Scenario[];
}
```

---

## Scenario

```typescript
interface Scenario {
  sceneId: string;              // Required. ID of the DOM element used as default trigger.
  trigger: TriggerScrollScrub | TriggerScrollObserver | TriggerTime;
  stagger?: number | { each: number }; // Optional. Offset between elements (seconds).
  elements: SceneElement[];
}
```

---

## Trigger Patterns

Three mutually exclusive patterns. `type` and `scrub` determine the pattern.

### 1. Scroll Scrub (progress locked to scroll)
```json
{
  "type": "scroll",
  "scrub": true,
  "start": "top top",
  "end": "bottom bottom",
  "startTrigger": "optional-override-element-id",
  "endTrigger": "optional-override-element-id",
  "pin": true,
  "pinSpacing": true,
  "snap": false
}
```
- `scrub`: `true` or a number (smoothing lag in seconds, e.g. `0.5`)
- `startTrigger` / `endTrigger`: override `sceneId` as the scroll trigger element
- `endTrigger`: **FORBIDDEN** on any other trigger type
- `pin` / `pinSpacing` / `snap`: **FORBIDDEN** on other trigger types

### 2. Scroll Observer (fires tween on viewport enter)
```json
{
  "type": "scroll",
  "scrub": false,
  "start": "top 80%",
  "end": "bottom 20%",
  "toggleActions": "play none none none",
  "repeat": 0,
  "yoyo": false,
  "repeatDelay": 0
}
```
- `toggleActions`: exactly 4 space-separated verbs: `onEnter onLeave onEnterBack onLeaveBack`
- Valid verbs: `play`, `pause`, `resume`, `reverse`, `restart`, `reset`, `complete`, `none`
- `end`: required when more than 1 toggleAction is not `"none"`
- `repeat` / `yoyo` / `repeatDelay`: allowed (autonomous timeline)

### 3. Time (pure timer)
```json
{
  "type": "time",
  "duration": 2,
  "repeat": -1,
  "yoyo": true,
  "repeatDelay": 0.5
}
```
- `duration`: scenario-level duration in seconds (overridable per element)
- `repeat`: `-1` = infinite loop
- `yoyo`: reverse on every other repeat

---

## Scene Element

```typescript
interface SceneElement {
  id: string;                         // Required. Matches the DOM element's id.
  duration?: number;                  // Overrides scenario trigger.duration for time/observer patterns.
  transformOrigin?: string;           // e.g. "50% 50%". Applied via gsap.set before animation.
  direction?: 'to' | 'from' | 'fromTo'; // Required only when a property has exactly 1 stop at an ambiguous position.
  keyframes: KeyframesMap;
}
```

### `direction` field rules:
| Condition | Behavior |
|---|---|
| Property has 2+ stops | `direction` is ignored — stops map directly to keyframes |
| 1 stop at `p ≈ 0` | Inferred `"from"` — stop value is start, animates to natural value |
| 1 stop at `p ≈ 1` | Inferred `"to"` — animates from natural value to stop value |
| 1 stop at middle | `direction` **required** — throws at build time if missing |

---

## Keyframes Map

```typescript
interface KeyframesMap {
  // Position
  x?: PropertyKeyframes;
  y?: PropertyKeyframes;
  z?: PropertyKeyframes;

  // Transform
  rotation?: PropertyKeyframes;
  rotationX?: PropertyKeyframes;
  rotationY?: PropertyKeyframes;
  scaleX?: PropertyKeyframes;
  scaleY?: PropertyKeyframes;
  skewX?: PropertyKeyframes;
  skewY?: PropertyKeyframes;

  // Visual
  opacity?: PropertyKeyframes;
  blur?: PropertyKeyframes;           // px
  brightness?: PropertyKeyframes;     // 0–2 (1 = normal)
  contrast?: PropertyKeyframes;       // 0–2 (1 = normal)
  saturate?: PropertyKeyframes;       // 0–2 (1 = normal)

  // Color (string values)
  backgroundColor?: PropertyKeyframes;
  color?: PropertyKeyframes;
  borderColor?: PropertyKeyframes;

  // CSS custom properties
  [cssVar: `--${string}`]: PropertyKeyframes;

  // Path (mutually exclusive with x/y)
  path?: PathKeyframes;
}
```

> **RULE:** `path` and `x`/`y` are mutually exclusive on the same element. Throws at build time.

---

## Property Keyframes

```typescript
interface PropertyKeyframes {
  stops: Stop[];
}

interface Stop {
  p: number;    // Progress 0.0–1.0 along the animation timeline
  v: number | string; // Value at this stop
  ease?: string; // GSAP ease applied on entry INTO this stop, e.g. "power2.out"
}
```

---

## Path Keyframes

```typescript
interface PathKeyframes {
  points: PathPoint[];  // Bezier control points
  stops: Stop[];        // Controls __pathProgress (0.0–1.0) along the path
}

interface PathPoint {
  x: number;
  y: number;
  z?: number;    // Defaults to 0
  ctrlX?: number; // Quadratic bezier control point. Absent = straight line.
  ctrlY?: number;
  ctrlZ?: number;
}
```

---

## Ease Collision Rule

If two properties on the same element specify different `ease` values at the same progress percentage, the engine **throws at build time** (after `contribute()` runs). This is a plugin bug, not a user error.

---

## Full Example

```json
{
  "projectId": "hero-page",
  "perspective": 1000,
  "scenarios": [
    {
      "sceneId": "hero-section",
      "trigger": {
        "type": "scroll",
        "scrub": true,
        "start": "top top",
        "end": "bottom bottom",
        "pin": true
      },
      "elements": [
        {
          "id": "hero-card",
          "keyframes": {
            "path": {
              "points": [
                { "x": -200, "y": 0, "z": -300 },
                { "x": 0, "y": -100, "z": 0, "ctrlX": 100, "ctrlY": -150 },
                { "x": 200, "y": 0, "z": 300 }
              ],
              "stops": [
                { "p": 0, "v": 0 },
                { "p": 1, "v": 1 }
              ]
            },
            "opacity": {
              "stops": [
                { "p": 0, "v": 0, "ease": "power2.out" },
                { "p": 0.2, "v": 1 },
                { "p": 0.8, "v": 1 },
                { "p": 1, "v": 0 }
              ]
            }
          }
        }
      ]
    }
  ]
}
```