# MotionPath v3 — LLM Reference

Grep-verified against `chahyasantoso/motionpath`, branch `v3`. Every field/rule below is read directly from source, not inferred. If you're generating or debugging a MotionPath project schema, this is the whole contract.

---

## 1. Mental model

A **project schema** (plain JSON) describes **motions**. Each motion has a **driver** (how its playhead is controlled) and one or more **tracks** (which DOM-bound properties animate, and how). A build-time **validator** rejects malformed schemas before any GSAP object is constructed. Two **engines** consume the same validated schema differently: `ProductionEngine` (real GSAP timelines/ScrollTriggers, used by React components) and `EditorEngine` (no auto-play, scrub via `.progress()`, used by tooling).

```
schema (JSON) → validateProject() → [throws on error] → engine.loadProject()
  → per motion: resolveTrack() (merge templates) → plugins build GSAP tweens
  → ProductionEngine: real ScrollTrigger/timeline   OR   EditorEngine: manual seek
```

---

## 2. Top-level schema shape

```jsonc
{
  "schemaVersion": 2, // REQUIRED, must be exactly 2 (current constant)
  "perspective": "1000px", // optional; if 3D props used without this, WARNING (not error)
  "templates": [
    /* Template[] */
  ],
  "motions": [
    /* Motion[] */
  ],
}
```

- `schemaVersion !== 2` (missing, wrong number, or non-object schema) → hard error, checked first, before anything else is validated.

---

## 3. Template object

Reusable keyframe fragments. Referenced by tracks via `track.use`.

```jsonc
{
  "templateId": "fade-in",     // REQUIRED, string, must be unique
  "keyframes": { "opacity": { "stops": [ ... ] } }
}
```

**Forbidden on templates** (hard error if present): `driver`, `timelineId`, `primary`, `trigger`.

**Merge semantics when a track has `use: "templateId"`:** whole-key replacement, NOT per-stop deep merge. If both the template and the local track define `keyframes.opacity`, the track's `opacity` key entirely replaces the template's — stops are not merged field-by-field. (`src/usecases/ResolveTrack.js`)

`track.use` referencing a non-existent `templateId` → hard error.

---

## 4. Motion object

```jsonc
{
  "motionId": "hero-reveal", // REQUIRED, non-empty string, unique project-wide
  "driver": {
    /* Driver — REQUIRED */
  },
  "stagger": 0.1, // optional, plain number only, see §7
  "staggerTransition": { "duration": 0.3, "ease": "power2.out" }, // optional, used by addChild/removeChild reflow only
  "tracks": [
    /* Track[], REQUIRED, min 1 */
  ],
}
```

`driver.type` must be `"timeline"` or `"delegate"`. Anything else → hard error.

---

## 5. Driver — `type: "timeline"` (GSAP-owned playhead)

```jsonc
{
  "type": "timeline",
  "sectionId": "hero", // default trigger-anchor id (used when trigger.trigger is absent)
  "timelineId": "hero-group", // optional — groups this motion into a shared master timeline, see §8
  "primary": true, // required exactly once per timelineId group
  "trigger": {
    /* Trigger — REQUIRED */
  },
}
```

### Trigger shapes (`driver.trigger`)

Exactly one `type`: `"scroll"` or `"time"`. Anything else → hard error.

**`type: "scroll"`** — `scrub` is REQUIRED, must be `boolean` or `number` (GSAP scrub smoothing value).

- `scrub: true` (or a number) → **scrub mode**. Directly bound to scroll position.
- `scrub: false` → **observer mode**. Fires once/toggles via `toggleActions`, runs on a real-seconds autonomous timeline.

**`type: "time"`** — pure autonomous timeline, no ScrollTrigger.

### Field legality matrix (validated by `trigger-shape.js`)

| Field                                       | scrub:true                                     | scrub:false (observer)                   | time          |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------- | ------------- |
| `start`, `end`, `pin`, `pinSpacing`, `snap` | ✅                                             | ✅ (start only; no pin/snap in practice) | ❌ n/a        |
| `toggleActions`                             | ❌ (scrub uses animation binding, not toggles) | ✅                                       | ❌            |
| `endTrigger`                                | ✅ only                                        | ❌ hard error                            | ❌ hard error |
| `repeat`, `yoyo`, `repeatDelay`             | ❌ hard error                                  | ✅                                       | ✅            |
| `delay`                                     | ❌ hard error                                  | ✅ (caveat below)                        | ✅            |
| `track.duration` (per-track override)       | ❌ hard error                                  | ✅                                       | ✅            |

**Known GSAP caveat (not a MotionPath bug, community-reported):** on observer triggers with multi-action `toggleActions`, `delay` applies correctly on enter/enterBack but has been reported skipped on leave/leaveBack. Fine for `"play none none none"`.

---

## 6. Driver — `type: "delegate"` (progress owned externally — game loops, headless)

```jsonc
{ "type": "delegate" }
```

That's it — delegate drivers carry **no other fields**. All of these are hard errors if present on a delegate motion: `trigger`, `sectionId`, `timelineId`, `primary`, and top-level `stagger` on the motion.

Delegate motions are resolved on-demand via `engine.resolveMotion(motionId, progress, overrides?)` — see §10. They never get a GSAP `ScrollTrigger`/timeline auto-attached; you drive `progress` yourself (e.g. from a `requestAnimationFrame` loop or a game's enemy `.progress` field).

---

## 7. Track object

```jsonc
{
  "id": "hero-card", // REQUIRED, non-empty string, unique PROJECT-WIDE (all motions)
  "use": "fade-in", // optional — merge in a template (whole-key replace, see §3)
  "duration": 2, // optional — per-track override; forbidden on scrub (see §5 matrix)
  "transformOrigin": "50% 50%", // optional passthrough to GSAP
  "keyframes": {
    /* PropertyKeyframes, keyed by property name */
  },
}
```

⚠️ **`track.id` is validated as unique PROJECT-WIDE**, not just within a motion (verified live behavior: `EditorEngine` builds one flat `Map` keyed only by `trackId` across all mounted motions — a per-motion-only uniqueness check would let two motions silently collide in that map). Always generate unique track IDs across the entire schema, never just within one motion.

### `keyframes.<property>` shape

```jsonc
"opacity": {
  "stops": [
    { "p": 0.0, "v": 0 },
    { "p": 1.0, "v": 1, "ease": "power2.out" }
  ]
}
```

- `stops` REQUIRED, min **2** entries (`stop-count.js`) for every animated property, including `path.stops`.
- Each stop: `p` REQUIRED number in `[0, 1]`; `v` REQUIRED (any defined value); `ease` optional, applies going INTO that stop.
- **Ease collision**: if two different properties on the same track have stops at the _same literal `p`_ with _different_ `ease` values → hard error. Fix: nudge one property's `p` slightly. No auto-resolution.

### Supported property keys (plugin registry, `src/domain/plugins.js`)

| Category                                            | Keys                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Position/transform (simple, eager)                  | `x`, `y`, `z`, `rotation`, `rotationX`, `rotationY`, `rotateX`, `rotateY`, `rotateZ`, `scale`, `scaleX`, `scaleY`, `skewX`, `skewY`, `opacity`, `display`, `zIndex`, `xPercent`, `yPercent`, `transformPerspective` |
| Color (eager)                                       | `backgroundColor`, `color`, `borderColor` — `v` is a CSS color string                                                                                                                                               |
| Filter (eager, consolidated)                        | `blur`, `brightness`, `contrast`, `saturate` — see §11                                                                                                                                                              |
| CSS custom properties (eager)                       | any `--*` key                                                                                                                                                                                                       |
| Path (eager)                                        | `path` — `{ points: [...], stops: [...] }`, see §9                                                                                                                                                                  |
| Image sequence (eager)                              | `imageSequence` — `{ frames: string[], stops: [...] }`, see below                                                                                                                                                   |
| Lazy (GSAP Club add-ons, stub only in current code) | `splitText`, `morphSVG`, `drawSVG`, `scrambleText`                                                                                                                                                                  |

**`x`/`y` and `path` are mutually exclusive on the same track** — both present → hard error (`path-xy-exclusivity.js`).

### `imageSequence` shape

```jsonc
"imageSequence": {
  "frames": ["/seq/f0001.webp", "/seq/f0002.webp", ...],  // REQUIRED, min 1 string
  "stops": [
    { "p": 0, "v": 0 },          // v = frame index, integer 0..frames.length-1
    { "p": 1, "v": 191 }
  ]
}
```

---

## 8. `timelineId` / `primary` — grouping motions into one master timeline

Only motions of the **identical trigger type AND scrub value** may share a `driver.timelineId` (validated by `timeline-group.js`):

- scrub-with-scrub only (same `scrub` value across the group)
- time-with-time only
- **observer (`scroll`, `scrub:false`) can never join a group** — hard error if it tries.

Rules:

- Exactly one member must have `driver.primary: true` — 0 or 2+ is a hard error.
- Non-primary members must NOT declare `start`, `end`, `pin`, `pinSpacing`, `snap`, `repeat`, `yoyo`, `repeatDelay` on their own `trigger` — hard error if present. Only `type`/`scrub` compatibility is checked on non-primary members; the primary's config drives the whole group.
- Members nest into one real GSAP master timeline (`TimelineGroupController`), added in schema-declaration order (sequential positioning, GSAP default — no explicit offset field).
- Runtime: `ProductionEngine` patches `instance.play`/`instance.pause` on every group member to delegate to the shared controller instead of that member's own child timeline. (`seek()` is NOT currently patched this way — avoid relying on `instance.seek()` for group members in production code; `EditorEngine.setProgress()` already resolves group-level correctly and is the supported way to scrub group members.)

---

## 9. `path` property

```jsonc
"path": {
  "points": [
    { "x": 0, "y": 0 },
    { "x": 100, "y": 50, "ctrlX": 60, "ctrlY": 10 }   // ctrlX/ctrlY optional, must come as a pair
  ],
  "stops": [
    { "p": 0, "v": 0 },      // v = position along path, 0..1, NOT the same as p
    { "p": 1, "v": 1 }
  ]
}
```

- `points` min 2 waypoints. `ctrlX`/`ctrlY` must be provided together or not at all (mismatched pair → error). Control points on the FIRST point are a no-op warning (no preceding segment).
- `points` is the **raw waypoint input**, not a pre-converted cubic Bézier array — `pathPlugin.js` converts internally at build time.
- `path.stops[].v` must be `0 <= v <= 1` (this is the only rule that validates `path.stops`; `p` itself follows the normal stop-shape/stop-count rules).
- **Architectural note:** GSAP's `MotionPathPlugin` is deliberately NOT used — a browser spike showed 121px max positional error because `motionPath` tracks its own internal tween time, ignoring custom per-segment easing. `path.stops` instead drives a synthetic `__pathProgress` value through the normal keyframe mechanism, and `compose()` converts it via `getPointOnCubicPath()`.

---

## 10. Runtime API

### Engine interface (both `ProductionEngine` and `EditorEngine`)

```ts
await engine.loadProject(schema)          // validates; throws with all hard errors joined if invalid
engine.mountInstance(motionId, config?)   // → MotionInstance
engine.resolveMotion(motionId, progress, overrides?)  // delegate motions only; throws on 'timeline' driver
engine.registerTriggerRef(id, ref)        // ref = { current: domNode }
engine.unregisterTriggerRef(id, ref)
engine.destroy()                          // tears down everything, kills all GSAP objects
```

- `loadProject()` runs `validateProject(schema)` first. If any `severity: "error"` entries exist, it throws one `Error` with all messages joined by newlines and a `.validationErrors` array attached. `severity: "warning"` entries are `console.warn`'d, not thrown.
- `mountInstance()` throws `"mountInstance: project not loaded."` if called before `loadProject()` resolves.

### `resolveMotion(motionId, progress, overrides?)` — for delegate motions

- Always returns `Record<trackId, DOMPatch>` for every track in that motion.
- Throws if called on a `driver.type: "timeline"` motion.
- **Cached per `(motionId, trackId)` when called with no overrides** — the tween is built once and reused via `.progress()`. Calls WITH `overrides` are deliberately never cached (each is a one-off, e.g. a projectile's unique arc). Cache is cleared on `_cleanup()`/reload.
- Throws a wrapped error (`resolveMotion: plugin compose failed for motion "X", track "Y"...`) on any plugin failure — never silently drops a track.

### `MotionInstance` (returned by `mountInstance`)

```ts
instance.id                    // generated unique id, e.g. "inst-42"
instance.motionId               // the schema motionId this instance was mounted from
instance.timeline               // the underlying GSAP timeline
instance.requiredTriggerIds     // string[] of trigger/startTrigger/endTrigger/pin ids this instance needs registered

instance.play()                 // no-op unless driver.type === "timeline"
instance.pause()
instance.seek(progress)         // ALWAYS targets this instance's own timeline directly — see §8 caveat for group members
instance.onComplete(callback)

instance.subscribe(trackId, callback)  // → unsubscribe fn. callback fires immediately with current snapshot, then on every timeline tick.
instance.compose(trackId, rawData?)     // runs plugins' compose(), returns a DOM-ready patch object. rawData defaults to current proxy snapshot if omitted.
instance.getCurrentSnapshot(trackId)    // raw proxy values + progress, no compose applied

instance.addChild(motionIdOrConfig, config?)  // mounts a nested instance via config.parentId, auto-staggered unless config.delay given
instance.removeChild(childInstance)            // animates sibling reflow (staggerTransition), then destroys

instance.disableTrigger() / enableTrigger()    // ScrollTrigger.disable(false)/.enable() passthrough
instance.destroy()
instance.isDestroyed                            // getter
```

- `subscribe()` throws if `trackId` doesn't exist on this instance: `subscribe: track "X" not found in instance.`
- Multiple `subscribe()` calls with the _same_ callback function are independent — each gets its own wrapper and its own unsubscribe.
- `compose()` returns `{}` (not a throw) if `trackId` doesn't exist — inconsistent with `subscribe()`'s throw; check `tracksMap` yourself if you need to distinguish "no track" from "empty patch."

### React hooks

```jsx
useMotionProject(schema)                          // loads a schema into the singleton productionEngine once; handles the async load
useMotionInstance(motionId, config?)               // mounts a MotionInstance, auto-destroys on unmount, returns null until mounted
useMotionTrigger(id, ref)                          // registers a DOM ref as a trigger/startTrigger/pin/endTrigger anchor (push registration, no data-motion-id/querySelector)
useMotionSubscriber(instance, trackId, ref, transformFn?)  // subscribes + applies via gsap.set(), zero React re-renders
useMotionTimelinePlayback(instance, playing: boolean)      // ongoing play()/pause() control tied to a boolean
useSmoothScroll()                                  // scroll smoothing utility, unrelated to motion schema
useDynamicHeight()                                 // layout utility, unrelated to motion schema
```

⚠️ **Singleton constraint:** `useMotionTrigger`/`useMotionProject`/`useMotionInstance` are all hard-wired to the module-level `productionEngine` singleton, not an injectable instance. Only one motion project can be active per page at a time through the hook layer. (`createProductionEngine(deps)` exists for custom instances, e.g. tests or non-hook usage, but the hooks themselves don't accept a custom engine.)

---

## 11. Filter consolidation pattern

`blur`/`brightness`/`contrast`/`saturate` never write to CSS `filter` directly during tweening. Each writes its own raw number via the normal keyframe/proxy mechanism. Only `compose()` (via `filterGroupPlugin`) reads whichever are present and merges them into one `{ filter: { blur, brightness, ... } }` object — merged key-by-key across plugins, not flat-overwrite. `src/renderers/domRenderer.js` is the only place that ever turns that into a literal CSS `filter` string and calls `gsap.set()`. If you're writing a custom renderer (e.g. Flutter), read raw numbers from `compose()`'s output, not a serialized string.

---

## 12. Quick-reference: what throws vs. what's silently allowed

**Hard errors (validator, before any GSAP object is built):**
`schemaVersion` wrong/missing · duplicate `motionId` · duplicate `track.id` project-wide · duplicate `templateId` · `track.use` → non-existent template · missing/malformed `driver` · `driver.type` not `timeline`/`delegate` · delegate motion with `trigger`/`sectionId`/`timelineId`/`primary`/`stagger` · trigger `type` not `scroll`/`time` · scroll trigger missing `scrub` · `endTrigger` outside scrub · `repeat`/`yoyo`/`repeatDelay`/`delay`/`track.duration` on scrub · `stagger` non-number or negative · fewer than 2 stops on any animated property · malformed stop (`p` not `0..1`, missing `v`) · `path`+`x`/`y` both present · `path.points` < 2 or malformed · `imageSequence.frames` empty/non-string · `imageSequence.stops[].v` out of frame range · timeline-group trigger-type mismatch · timeline-group containing an observer · timeline-group with ≠1 primary · non-primary group member declaring `start`/`end`/`pin`/etc. · ease collision at same literal `p` on different properties.

**Warnings only (logged, does not block `loadProject`):**
3D keyframe properties (`z`/`rotationX`/`rotationY`) used without top-level `perspective` · `ctrlX`/`ctrlY` on the first path point · non-zero `stagger` with fewer than 2 tracks.

**Silently allowed (no validation exists yet — be careful generating these):**
Same `sceneId`/`sectionId` used by unrelated motions that aren't grouped by `timelineId` (this is an intentionally supported pattern per the design docs, not a gap) · `staggerTransition` malformed values (no dedicated shape rule) · lazy plugin keys (`splitText`/`morphSVG`/`drawSVG`/`scrambleText`) are registered but their `contribute()` is a no-op stub — schema authors CAN use these keys and no error will fire, but nothing will actually animate.

---

## 13. Minimal worked example (verified pattern from a real production demo)

```jsonc
{
  "schemaVersion": 2,
  "motions": [
    {
      "motionId": "hero-reveal",
      "driver": {
        "type": "timeline",
        "sectionId": "hero-section",
        "trigger": {
          "type": "scroll",
          "scrub": 0.5,
          "start": "top top",
          "end": "bottom bottom",
        },
      },
      "tracks": [
        {
          "id": "hero-title",
          "keyframes": {
            "opacity": {
              "stops": [
                { "p": 0, "v": 0 },
                { "p": 0.15, "v": 1, "ease": "power2.out" },
                { "p": 1, "v": 0 },
              ],
            },
            "y": {
              "stops": [
                { "p": 0, "v": 120 },
                { "p": 0.25, "v": 0, "ease": "power2.out" },
                { "p": 1, "v": -120 },
              ],
            },
          },
        },
      ],
    },
  ],
}
```

```jsx
const project = useMotionProject(schema);
const instance = useMotionInstance("hero-reveal");
const ref = useRef(null);
useMotionTrigger("hero-section", ref);
useMotionSubscriber(instance, "hero-title", titleRef);
```
