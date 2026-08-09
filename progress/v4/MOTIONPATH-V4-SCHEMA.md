# MotionPath v4 — Schema Reference

> **Status:** derived by reading branch `v4` source, not from prose docs.
> Where the repo's `README.md` or `src/domain/types.js` disagree with this document, **this document matches the code** and those two files are stale. See the companion Architecture Review, finding R-19/R-20.
>
> **Source of truth in code:** `src/validators/rules/*.js` (declared constraints) + `src/lib/schema/parseV4Project.js` and `src/usecases/*.js` (actual runtime expectations).

---

## 1. Top-level project

```jsonc
{
  "schemaVersion": 4,
  "projectId": "my-page",
  "perspective": 1200,
  "templates": [
    /* Template[]  — optional */
  ],
  "motions": [
    /* Motion[]    — required */
  ],
  "tracks": [
    /* Track[]     — optional, standalone */
  ],
}
```

| Field           | Type       | Required | Notes                                                                                                                                                      |
| --------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | number     | **yes**  | Validator accepts `2 \| 3 \| 4` (`SUPPORTED_SCHEMA_VERSIONS`), but every v2/v3 field is hard-rejected by `motion-structure`. **Always write `4`.**         |
| `projectId`     | string     | no       | Informational only; nothing reads it at runtime.                                                                                                           |
| `perspective`   | number     | no       | CSS perspective in px for 3D scenes. Consumed by the app layer, not the engine.                                                                            |
| `templates`     | Template[] | no       | Reusable keyframe bundles referenced by `track.use`.                                                                                                       |
| `motions`       | Motion[]   | **yes**  | Must be an array or validation bails early.                                                                                                                |
| `tracks`        | Track[]    | no       | Standalone tracks with no trigger. Parsed and mountable/stampable, but **only `motion-structure` validates them** — the per-track rules never run on them. |

---

## 2. Template

A named, reusable bundle of keyframes. Templates have **no trigger and no lifecycle** — they are pure data.

```jsonc
{
  "templateId": "card-rise",
  "duration": 1.2,
  "transformOrigin": "50% 50%",
  "keyframes": {
    /* Keyframes */
  },
}
```

| Field             | Type      | Required | Notes                                             |
| ----------------- | --------- | -------- | ------------------------------------------------- |
| `templateId`      | string    | **yes**  | Must be unique across `templates`.                |
| `duration`        | number    | no       | Seconds. Inherited by tracks that omit their own. |
| `transformOrigin` | string    | no       | Inherited. Applied by the app layer.              |
| `keyframes`       | Keyframes | no       | Merged per property key with the consuming track. |

**Forbidden on templates** (each produces its own error): `driver`, `timelineId`, `primary`, `trigger`.

---

## 3. Motion

A Motion is **one trigger + one master GSAP timeline + N tracks**. Tracks under the same Motion share the trigger automatically — that is why v3's `timelineId` grouping is gone.

```jsonc
{
  "id": "hero-scroll",
  "trigger": {
    "type": "scroll",
    "scrub": true,
    "start": "top top",
    "end": "bottom top",
  },
  "stagger": 0.15,
  "staggerTransition": { "duration": 0.55, "ease": "power2.out" },
  "tracks": [
    /* Track[] — at least 1 */
  ],
}
```

| Field               | Type                 | Required | Notes                                                                                                                                                                              |
| ------------------- | -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | string               | **yes**  | Non-empty, unique across `motions`. **Use `id`, never `motionId`.** The validator tolerates `motionId`, the runtime does not — see the trap below.                                 |
| `trigger`           | Trigger              | **yes**  | Must be an object with a string `type` registered in `triggerDelegateRegistry`.                                                                                                    |
| `stagger`           | number               | no       | **Seconds** between successive tracks on the master timeline. Track _i_ is mounted at position `i * stagger`.                                                                      |
| `staggerTransition` | `{ duration, ease }` | no       | How a surviving sibling _slides_ to its new slot when a child is removed and the layout delegate reflows. `duration: 0` (default) = instant snap. `ease` defaults to `power2.out`. |
| `tracks`            | Track[]              | **yes**  | Minimum 1 entry.                                                                                                                                                                   |

**Forbidden on motions** (v2/v3 leftovers, each its own error): `driver`, `timelineId`, `primary`, `lifecycle`, `playback`.

> ### ⚠️ Trap: `id` vs `motionId`
>
> `src/validators/rules/motion-structure.js` computes `effectiveId = id ?? motionId`, so a schema using `motionId` **passes validation**. But `parseV4Project` and `Engine` only read `motionConfig.id`, so that motion lands in the map under key `undefined` and `mountInstance('my-id')` throws "not found". Always use `id`.

---

## 4. Trigger

`trigger.type` selects a factory from `triggerDelegateRegistry` (`src/lib/TriggerDelegate.js`). Three are built in; register more with `registerTriggerDelegate(type, factory)`.

### 4.1 `scroll`

Backed by GSAP ScrollTrigger.

```jsonc
{
  "type": "scroll",
  "scrub": true,
  "trigger": "#hero",
  "start": "top top",
  "end": "bottom top",
  "pin": true,
  "pinSpacing": false,
}
```

| Field                             | Type                         | Required | Notes                                                                                                                     |
| --------------------------------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `scrub`                           | boolean \| number            | **yes**  | Presence is enforced. `true`/number = scrub mode; `false` = observer mode.                                                |
| `trigger`                         | string \| Element            | no       | Passed straight to ScrollTrigger. With `useScrollMotion` this is **replaced by a live component ref**.                    |
| `start` / `end`                   | string                       | no       | Standard ScrollTrigger syntax.                                                                                            |
| `endTrigger`                      | string \| Element            | no       | **Scrub-only.** Illegal on observer triggers.                                                                             |
| `pin`                             | boolean \| string \| Element | no       | `true` pins the trigger element. `useScrollMotion` treats the literal string `"pin"` as "use my `refs.pin`".              |
| `pinSpacing`                      | boolean                      | no       | Passed through.                                                                                                           |
| `toggleActions`                   | string                       | no       | Observer mode, e.g. `"play pause resume pause"`.                                                                          |
| `repeat` / `yoyo` / `repeatDelay` | number / boolean / number    | no       | **Illegal when scrubbing.** Note: `ScrollTriggerDelegate.build()` does not currently forward these even in observer mode. |
| `delay`                           | number                       | no       | **Illegal when scrubbing.** Not forwarded by the delegate.                                                                |

**Also illegal under scrub:** any `track.duration` in this motion (scroll position _is_ the playhead).

### 4.2 `time`

Backed by a plain GSAP timeline.

```jsonc
{ "type": "time", "repeat": -1, "yoyo": true, "repeatDelay": 0.4 }
```

| Field         | Type    | Honored? | Notes                                                                                                                                    |
| ------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `repeat`      | number  | ✅       | `-1` = infinite.                                                                                                                         |
| `yoyo`        | boolean | ✅       |                                                                                                                                          |
| `repeatDelay` | number  | ✅       |                                                                                                                                          |
| `duration`    | number  | ❌       | **Silently ignored** by `TimeTriggerDelegate`. Real duration comes from each track's own `duration`.                                     |
| `delay`       | number  | ❌       | **Silently ignored.**                                                                                                                    |
| `autoplay`    | boolean | ❌       | **Silently ignored — every time motion autoplays.** `autoplay: false` does nothing; you must call `motion.pause()` yourself after mount. |

### 4.3 `manual`

A paused timeline you drive yourself. No config fields.

```jsonc
{ "type": "manual" }
```

Drive it via `useManualMotion(id).seek(p)` (which calls `delegate.progress(p)`). Note this delegate exposes `progress()` where the other two expose `seek()` — the interfaces are not symmetric.

---

## 5. Track

A Track is **one animatable entity**: a GSAP tween over a plain proxy object, plus the plugin set that interprets it. A Track has no DOM knowledge at all.

```jsonc
{
  "id": "card-1",
  "use": "card-rise",
  "duration": 1.2,
  "transformOrigin": "50% 50%",
  "keyframes": {
    /* Keyframes */
  },
}
```

| Field             | Type      | Required | Notes                                                                                                                                                        |
| ----------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`              | string    | **yes**  | Non-empty. Must be unique per `element-uniqueness` scope. Subscribers address tracks by this id.                                                             |
| `use`             | string    | no       | A `templateId`. Must exist or you get an error.                                                                                                              |
| `duration`        | number    | no       | Seconds. **Defaults to `1`** if absent on both track and template (`createTrack`). Illegal under scroll-scrub.                                               |
| `transformOrigin` | string    | no       | Local value wins over template.                                                                                                                              |
| `keyframes`       | Keyframes | no       | Merged with the template **per property key, whole-array replacement** — a track's `x` replaces the template's `x` entirely, it does not merge stop-by-stop. |

---

## 6. Keyframes and Stops

```jsonc
"keyframes": {
  "opacity": { "stops": [ { "p": 0, "v": 0 }, { "p": 1, "v": 1, "ease": "power2.out" } ] },
  "scale":   { "stops": [ { "p": 0, "v": 1 }, { "p": 0.35, "v": 1.7 }, { "p": 1, "v": 0 } ] },
  "--ball-size": { "stops": [ { "p": 0, "v": "28px" }, { "p": 1, "v": "28px" } ] }
}
```

### Stop

| Field  | Type             | Required | Notes                                                                                               |
| ------ | ---------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `p`    | number           | **yes**  | Normalized progress, `0 <= p <= 1`. Compiled to a GSAP keyframe percent key as `` `${p * 100}%` ``. |
| `v`    | number \| string | **yes**  | Must not be `null`/`undefined`. Plugin decides the meaning.                                         |
| `ease` | string           | no       | GSAP ease name. Applies to the segment **arriving at** this stop.                                   |

**Enforced:** at least 2 stops per property (`stop-count`), object shape and `p` range (`stop-shape`).

**Not enforced (author beware):**

- Stops are **not** required to be sorted, and **not** required to include `p: 0` or `p: 1`.
- The tween proxy is seeded **only from the merged `0%` frame**. A property with no `p: 0` stop starts as `undefined`.
- Duplicate `p` values silently overwrite each other.
- `p * 100` is raw float math: `p: 0.29` becomes the key `"28.999999999999996%"`. Two stops you _think_ are identical can produce different keys and slip past the ease-collision check.

### Ease collision

Two different properties that place **different** `ease` values at the **same** percent key are a hard build error (`BuildTrackTween`, and the `ease-collision` rule). One percent key = one ease for the whole track. This is intentional: all properties of a track share a single tween.

---

## 7. Property key catalog

Every key in `keyframes` must be claimed by exactly one plugin (`resolvePluginForKey`), or `BuildTrackTween` throws `No plugin found for key "..."`.

### 7.1 Simple properties — passthrough to `gsap.set`

`x` · `y` · `z` · `rotation` · `rotationX` · `rotationY` · `rotateX` · `rotateY` · `rotateZ` · `scale` · `scaleX` · `scaleY` · `skewX` · `skewY` · `opacity` · `display` · `zIndex` · `xPercent` · `yPercent` · `transformPerspective`

### 7.2 Color properties

`backgroundColor` · `color` · `borderColor` — same `stops` shape, string values.

### 7.3 Filter group

`blur` · `brightness` · `contrast` · `saturate`

These do **not** emit individual CSS props. They are collected into a `filter` object and serialized by `domRenderer` as `blur(Npx) brightness(N) contrast(N) saturate(N)`. **Only these four functions are supported** — `hue-rotate`, `grayscale`, `drop-shadow` etc. would be silently dropped.

### 7.4 `path` — Bézier motion path

```jsonc
"path": {
  "points": [ { "x": 0, "y": 0 }, { "x": 200, "y": 120, "ctrlX": 100, "ctrlY": 0 } ],
  "stops": [ { "p": 0, "v": 0 }, { "p": 1, "v": 1, "ease": "none" } ],
  "autoRotate": true
}
```

| Field        | Type       | Notes                                                                                                                                                                                     |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `points`     | PathNode[] | `{ x, y, z?, ctrlX?, ctrlY?, ctrlZ? }`. Quadratic controls are elevated to cubic. Compiled **once** at build time — a path cannot be re-targeted at runtime without rebuilding the track. |
| `stops`      | Stop[]     | `v` is normalized **distance along the path**, clamped to 0..1. Not time.                                                                                                                 |
| `autoRotate` | boolean    | Emits `rotation` from the local path tangent.                                                                                                                                             |

**Emits:** `x`, `y`, `z`, **`xPercent: -50`, `yPercent: -50`** (hardcoded centering), and `rotation` when `autoRotate`.

> ⚠️ Because `path` hardcodes `xPercent/yPercent: -50`, it **conflicts with the `xPercent`/`yPercent`/`x`/`y`/`rotation` simple keys**. Which one wins depends on the order your keys appear in the `keyframes` object literal. See §9.

**Internal proxy keys** (never author these directly, they are stripped before DOM write): `pathProgress`, `cubicPath`, `autoRotate`.

### 7.5 CSS custom properties

Any key starting with `--` is claimed by the CSS-var plugin and passed through verbatim. Values are usually unit-bearing strings (`"28px"`).

### 7.6 `imageSequence` — frame-by-frame

```jsonc
"imageSequence": {
  "frames": ["/seq/001.webp", "/seq/002.webp"],
  "stops": [ { "p": 0, "v": 0 }, { "p": 1, "v": 1 } ]
}
```

`v` is a **frame index** (rounded, clamped to `frames.length - 1`). Emits `backgroundImage: url(...)`. Frames are preloaded and cached by the joined frame list. Note the preload fires as a side effect during compilation and is **not awaited**, so the first frames may pop in.

### 7.7 `boneLength` — forward kinematics

```jsonc
"boneLength": { "stops": [ { "p": 0, "v": 40 }, { "p": 1, "v": 90 } ] }
```

Emits world-space `{ x, y, rotation }` by composing `rawData.parentWorld` with the local bone. `parentWorld` is **not authored in the schema** — it is injected at runtime by `track.setObserved(parentTrack, mapFn, { role: 'input' })`. Root joints (no `parentWorld`) sit at `x = boneLength`, `rotation = 0`.

### 7.8 Declared but not implemented

`splitText` · `morphSVG` · `drawSVG` · `scrambleText` — registered as lazy stubs that **reject on load and throw on contribute**. Using them is a hard error, not a silent no-op.

---

## 8. Validation rules (all 12)

| Rule                  | Scope        | Enforces                                                                                                                                        |
| --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema-version`      | project      | Present and in `[2,3,4]`.                                                                                                                       |
| `motion-structure`    | project      | Template/motion ids, uniqueness, forbidden v2/v3 fields, `trigger` presence, `tracks` non-empty, `use` references resolve.                      |
| `trigger-shape`       | motion       | Registered `type`; `scrub` required on scroll; scrub-incompatible fields (`repeat`/`yoyo`/`repeatDelay`/`delay`/`endTrigger`/track `duration`). |
| `ease-collision`      | motion       | No two properties assign different eases at the same percent.                                                                                   |
| `stagger-shape`       | motion       | `stagger` / `staggerTransition` shape.                                                                                                          |
| `perspective-usage`   | motion       | 3D props used consistently with `perspective`.                                                                                                  |
| `stop-count`          | track        | ≥ 2 stops per animated property.                                                                                                                |
| `stop-shape`          | track        | Each stop is an object with numeric `p` in 0..1 and defined `v`.                                                                                |
| `path-shape`          | track        | `points` shape and `ctrl*` pairing.                                                                                                             |
| `path-xy-exclusivity` | track        | `path` not combined with conflicting `x`/`y`.                                                                                                   |
| `image-sequence`      | track        | `frames` array and index-range sanity.                                                                                                          |
| `element-uniqueness`  | cross-motion | No duplicate track ids across motions.                                                                                                          |

All rules are **collect-all and never throw** — `validateProject(schema)` returns `ValidationError[]` of `{ ruleId, severity, message, path }`.

> ### 🚨 Critical: validation is not wired into loading
>
> `Engine.loadProject()` calls `parseV4Project()` only. **`validateProject` is never called anywhere in the runtime path.** Until that is fixed (Review finding R-01), you must call it yourself:
>
> ```js
> import { validateProject } from "./validators/index.js";
> const errors = validateProject(schema);
> if (errors.some((e) => e.severity === "error"))
>   throw new Error(JSON.stringify(errors, null, 2));
> await engine.loadProject(schema);
> ```

---

## 9. Compose-order hazard (read this before combining keys)

Plugins run in the order their keys appear in `Object.keys(keyframes)`, and later plugins **overwrite** earlier ones key-for-key (`ComposeTrackPatch`). There is no priority system. Therefore:

```jsonc
// path wins x/y  -> element follows the curve
{ "keyframes": { "x": {...}, "path": {...} } }

// x wins over path -> element snaps to the x tween, curve is ignored
{ "keyframes": { "path": {...}, "x": {...} } }
```

The overlapping emitters are:

| Plugin            | Emits                                                  |
| ----------------- | ------------------------------------------------------ |
| `path`            | `x`, `y`, `z`, `xPercent`, `yPercent`, `rotation`      |
| `boneLength` (FK) | `x`, `y`, `rotation`                                   |
| simple keys       | `x`, `y`, `z`, `rotation`, `xPercent`, `yPercent`, ... |

**Rule of thumb:** never put `path` or `boneLength` in the same track as the transform keys they emit. Put them on separate tracks and compose with nested DOM wrappers, or with `setObserved`.

---

## 10. Complete worked example

```js
export const project = {
  schemaVersion: 4,
  projectId: "demo",
  perspective: 1200,

  templates: [
    {
      templateId: "fade-pop",
      duration: 0.6,
      keyframes: {
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
        },
        scale: {
          stops: [
            { p: 0, v: 0.8 },
            { p: 1, v: 1, ease: "back.out(2)" },
          ],
        },
      },
    },
  ],

  motions: [
    // 1. Scroll-scrubbed path travel. No track durations allowed.
    {
      id: "rocket-scroll",
      trigger: {
        type: "scroll",
        scrub: true,
        start: "top top",
        end: "bottom top",
        pin: true,
      },
      tracks: [
        {
          id: "rocket",
          keyframes: {
            path: {
              points: [
                { x: 0, y: 0 },
                { x: 320, y: 180, ctrlX: 160, ctrlY: 0 },
                { x: 640, y: 0 },
              ],
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1, ease: "none" },
              ],
              autoRotate: true,
            },
            blur: {
              stops: [
                { p: 0, v: 0 },
                { p: 0.5, v: 6 },
                { p: 1, v: 0 },
              ],
            },
          },
        },
      ],
    },

    // 2. Time loop with stagger. Tracks inherit the template.
    {
      id: "cards-loop",
      trigger: { type: "time", repeat: -1, yoyo: true, repeatDelay: 0.3 },
      stagger: 0.12,
      staggerTransition: { duration: 0.55, ease: "power2.out" },
      tracks: [
        { id: "card-1", use: "fade-pop" },
        { id: "card-2", use: "fade-pop", duration: 0.9 },
        {
          id: "card-3",
          use: "fade-pop",
          keyframes: {
            scale: {
              stops: [
                { p: 0, v: 1 },
                { p: 1, v: 1.4 },
              ],
            },
          },
        },
      ],
    },

    // 3. Manual: you own the playhead.
    {
      id: "scrubber",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "needle",
          duration: 1,
          keyframes: {
            rotation: {
              stops: [
                { p: 0, v: -90 },
                { p: 1, v: 90 },
              ],
            },
          },
        },
      ],
    },
  ],

  // Standalone stamping templates: no trigger, cloned per instance at runtime.
  tracks: [
    {
      id: "ball-exit-track",
      duration: 0.35,
      keyframes: {
        scale: {
          stops: [
            { p: 0, v: 1 },
            { p: 0.35, v: 1.7 },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 1 },
            { p: 1, v: 0 },
          ],
        },
      },
    },
  ],
};
```

---

## 11. Migration cheat sheet (v3 → v4)

| v3                            | v4                                                   |
| ----------------------------- | ---------------------------------------------------- |
| `scenarios[]`                 | `motions[]`                                          |
| `scenario.sceneId`            | `motion.id`                                          |
| `scenario.elements[]`         | `motion.tracks[]`                                    |
| `element.id`                  | `track.id`                                           |
| `scenario.timelineId`         | **removed** — tracks in one motion share its trigger |
| `scenario.primary`            | **removed**                                          |
| `motion.driver`               | **removed** — `trigger` is the only driver concept   |
| `lifecycle`, `playback`       | **removed**                                          |
| `options.initialPlayStates`   | **removed** — call `motion.pause()` after mount      |
| `useMotionTrigger('id', ref)` | `useScrollMotion(schema)` returns `refs` you attach  |

All six removed fields produce explicit validation errors naming them, so a v3 schema fails loudly rather than silently.
