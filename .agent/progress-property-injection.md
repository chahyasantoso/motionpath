# Normalized Progress Property Injection

This document describes the design background, the problem of unit-coupled styling arithmetic, the structural rationale, and the solution for injecting a clean, normalized `progress` property directly into the subscriber broadcast stream.

---

## 1. Background

In MotionPath, custom animations are often computed at runtime inside component-level subscriber callbacks (e.g. `useMotionSubscriber(elementId, ref, transformFn)`). These callbacks receive the engine's current state `rawData` and return a patch of styles applied directly to the DOM via GSAP.

A common design pattern is calculating secondary animations (like a tilt rotation or neon flicker) relative to primary coordinate translations. For example, leaning a card slightly while it slides into the viewport.

---

## 2. The Problem: Unit-Coupled Arithmetic (Silent DOM Discard)

Initially, developers calculated secondary transforms relative to absolute pixel coordinates:
```javascript
// Expects rawData.x to be a numeric pixel offset (e.g. -480)
const rotateZ = (rawData.x ?? 0) * 0.02; 
```
While this works for fixed desktop layouts, it fails when making the layout responsive:
1. To support multiple screen widths, the layout keyframes are changed to use viewport units (e.g., changing `{ p: 0, v: -480 }` to `{ p: 0, v: "-100vw" }`).
2. `rawData.x` becomes the string `"-100vw"`.
3. The multiplication `"-100vw" * 0.02` yields `NaN` (Not a Number).
4. GSAP serializes this style patch into the inline transform string: `transform: translate3d(-100vw, 0px, 0px) rotate(NaNdeg);`.
5. Because `NaNdeg` is invalid CSS syntax, the browser silently drops the **entire** transform rule. 
6. **Result**: The card fails to translate (does not slide at all) and only fades, creating a silent visual layout bug that is difficult to trace.

---

## 3. The Why: Decoupling Arithmetic from Coordinates

To prevent coordinate format changes (e.g., from pixels to `vw`, `vh`, `%`, or even 3D projections) from breaking math calculations, the custom transform function must be decoupled from layout units.

Instead of computing lean relative to absolute coordinates, the calculations should be driven by the **normalized animation progress** (a stable float from `0.0` to `1.0`) representing the element's position on its active timeline.

### Naming Conventions: Why We Avoided Underscores
To prevent naming collisions and keep the JSON schema clean:
- We avoided prefix conventions like `_progress` or `__progress`. Double underscores are reserved for internal system metadata and should not leak into the public schema/developer API.
- We chose the clean, prefix-free, camelCase property name: `progress`.

---

## 4. The Solution: Proxy-Level Progress Injection

During project building, the engine captures a reference to each element's GSAP `tween` instance. On every tick of the engine ticker, the core injects the current progress of that tween directly into the element's broadcast snapshot:

### A. Engine Core Injection ([engineCore.js](file:///d:/dev/motionpath/src/lib/engineCore.js#L23-L27))
```javascript
const progress = elementBuild.tween ? elementBuild.tween.progress() : 0;
const snapshot = {
  ...elementBuild.proxy,
  progress // Injected clean property float [0.0 - 1.0]
};
```

### B. Developer Callback Usage (Before vs. After)

#### Before (Fragile & Coupled to Pixels)
```javascript
const transform = useCallback((rawData, composeFn) => {
  const composed = composeFn(rawData);
  // DANGER: Will yield NaN if rawData.x is changed to string units (e.g. "-100vw")
  const rotateZ = (rawData.x ?? 0) * 0.02; 
  return { ...composed, rotateZ };
}, []);
```

#### After (Robust & Decoupled)
```javascript
const transform = useCallback((rawData, composeFn) => {
  const composed = composeFn(rawData);
  // SAFE: rawData.progress is always a float from 0 to 1, regardless of coordinate units
  const rotateZ = (1 - rawData.progress) * 10; 
  return { ...composed, rotateZ };
}, []);
```
Using `rawData.progress` completely resolves the class of bugs related to unit changes, keeping layouts responsive and arithmetic calculations secure.

---

## 5. Real-World Use Case: Driving Counter Animations via Progress

### The Problem with CSS Custom Variables as Transport

A natural early approach for animating DOM counters is to define them as CSS custom property keyframes in the schema:

```javascript
// stats-card keyframes (BEFORE)
'--stalls-count': {
  stops: [
    { p: 0, v: 0, ease: 'power2.out' },
    { p: 0.55, v: 192 }
  ]
}
```

Then read those values inside the subscriber callback:
```javascript
if (stallsEl && rawData['--stalls-count'] !== undefined) {
  stallsEl.textContent = `${Math.round(rawData['--stalls-count'])}+`;
}
```

**This works, but it has three design problems:**
1. **Schema pollution**: The schema's keyframes are intended to describe visual motion (position, scale, opacity). Adding counter state as a CSS custom property is a misuse of the animation schema.
2. **Engine does unnecessary work**: The engine interpolates `--stalls-count` on every tick, even though the value is never applied to a CSS property — it only exists as a number carrier.
3. **Implicit contract**: The callback must know the exact CSS variable name (`'--stalls-count'`) and check for `!== undefined` defensively. This is fragile coupling between schema and component.

### The Solution: Progress-Driven Eased Arithmetic

By removing the custom variable stops from the schema entirely and using `rawData.progress` with `gsap.parseEase`, the counter logic becomes self-contained in the callback:

```javascript
// Module scope — parsed once at load time, not on every render
const easeOut = gsap.parseEase('power2.out');

function StatsCard() {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    if (ref.current) {
      const p = rawData.progress;

      const stallsEl = ref.current.querySelector('.stalls-num');
      if (stallsEl) {
        // Stalls count resolves fully by p = 0.55, with power2.out deceleration
        const t = easeOut(Math.min(1, p / 0.55));
        stallsEl.textContent = `${Math.round(t * 192)}+`;
      }

      const visitorsEl = ref.current.querySelector('.visitors-num');
      if (visitorsEl) {
        // Visitors count resolves fully by p = 0.65
        const t = easeOut(Math.min(1, p / 0.65));
        visitorsEl.textContent = Math.round(t * 10000).toLocaleString();
      }
    }
    return composeFn(rawData);
  }, []);

  useMotionSubscriber('stats-card', ref, transform);
}
```

### Why `gsap.parseEase` at Module Scope

`gsap.parseEase('power2.out')` returns a pure function `(t: number) => number`. It is stateless and does not change. Calling it inside the component body would re-parse the easing curve string on every render. Hoisting it to module scope ensures it is computed exactly once, then reused on every tick.

### Summary of Benefits

| Concern | CSS Variable Approach | Progress Approach |
|---|---|---|
| Schema cleanliness | ❌ Counter data mixed into visual keyframes | ✅ Schema contains only visual properties |
| Engine overhead | ❌ Engine interpolates unused CSS vars | ✅ Engine only interpolates transform properties |
| Callback coupling | ❌ Must know exact CSS var names | ✅ `rawData.progress` is always available |
| Easing control | ❌ Easing is baked into the schema stops | ✅ Full programmatic easing control via `gsap.parseEase` |
| Responsive safety | ✅ Numbers are unit-free | ✅ Numbers are unit-free |
