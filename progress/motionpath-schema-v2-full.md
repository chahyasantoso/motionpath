# MotionPath Schema — v2 (Full Reference)

Built directly from `v2` branch source (`v2` @ commit `98cd066`), not from
memory or the v1 docs. Every rule below is traceable to a specific file —
cited inline — so this doc can be re-verified by grep the same way it was
written. No v2-equivalent doc existed in the repo before this one; the old
`.agent/motionpath-schema-v1-final.md` and `Locked_Decisions_Session_3.md`
describe v1 only and should not be treated as current.

---

## 1. Top-Level Shape

```json
{
  "schemaVersion": 2,
  "perspective": "800px",
  "templates": [ /* Template[] */ ],
  "motions": [ /* Motion[] */ ]
}
```

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | **yes** | Must be exactly `2` (literal number). *(`schema-version.js`)* |
| `perspective` | no | Root-level px string (e.g. `"800px"`). Only relevant if any track uses `z`/`rotationX`/`rotationY`/a 3D `path`. Missing it while using those triggers a **warning**, not an error. *(`perspective-usage.js`)* |
| `templates` | no | Array of reusable keyframe fragments. See §4. |
| `motions` | no* | Array of animation definitions. See §2. (*schema-structurally optional, but a project with none does nothing) |

---

## 2. `motions[]`

```json
{
  "motionId": "enemyMovement",
  "driver": { "type": "delegate" | "timeline", ... },
  "stagger": 0.1,
  "tracks": [ /* Track[] */ ]
}
```

| Field | Required | Notes |
|---|---|---|
| `motionId` | no | String. If present, must be unique project-wide. *(`motion-structure.js`)* |
| `driver` | **yes** | Object, `{ type: "timeline" \| "delegate", ... }`. See §3. |
| `stagger` | no | Plain number only — **no GSAP object form** (`{each, amount, from}` is rejected). Must be `>= 0`. Non-zero with fewer than 2 tracks → warning (no-op). **Forbidden entirely on `driver.type:"delegate"`** — build-time error if present. *(`stagger-shape.js`, `motion-structure.js`)* |
| `tracks` | **yes** | Array, minimum 1 entry. *(`motion-structure.js`)* |

---

## 3. `driver`

Every motion has exactly one driver, of one of two types.

### `driver.type: "timeline"`

```json
{
  "type": "timeline",
  "sectionId": "iceCreamSection",
  "timelineId": "iceCreamSection-master",
  "primary": true,
  "trigger": { /* Trigger */ }
}
```

| Field | Required | Notes |
|---|---|---|
| `type` | **yes** | `"timeline"` |
| `sectionId` | no | Default trigger-anchor element. Only valid under `driver.type:"timeline"`. *(v1's `sceneId`, renamed + relocated — was motion-top-level, now lives under `driver`)* |
| `timelineId` | no | Groups this motion into a shared master timeline with other motions sharing the same `timelineId`. See §3.2. |
| `primary` | no | Boolean. Exactly one `true` per `timelineId` group. See §3.2. |
| `trigger` | **yes** | Object. See §3.1. |

### `driver.type: "delegate"`

```json
{ "type": "delegate" }
```

No other fields on `driver`. **Build-time errors if any of the following are present** on a `driver.type:"delegate"` motion *(`motion-structure.js`)*:
- `driver.trigger`
- `driver.sectionId`
- `driver.timelineId`
- `driver.primary`
- `motion.stagger` (top-level, not under `driver`)

Delegate motions describe reusable, progress-driven animation resolved on demand by an external caller (a game loop, a headless caller) via `resolveMotion()` — see §7. They are **never** eagerly built into a live GSAP timeline, never scroll/time-triggered, and cannot be passed to `mountTimeline()` (throws — see §7).

### 3.1 `trigger` (timeline-driver only)

```json
{ "type": "scroll", "scrub": true, "start": "...", "end": "...", "pin": true }
{ "type": "scroll", "scrub": false, "start": "...", "toggleActions": "...", "delay": 2 }
{ "type": "time", "repeat": -1, "yoyo": true, "repeatDelay": 0.5, "delay": 1 }
```

All rules from `trigger-shape.js`:

| Rule | Detail |
|---|---|
| `trigger.type` | Required, exactly `"scroll"` or `"time"`. |
| `scroll` requires `scrub` | Required, `boolean` or `number`. |
| **"scrub"** = `type === "scroll" && (scrub === true \|\| typeof scrub === "number")** | This exact predicate gates every rule below. |
| `endTrigger` | Only valid when scrub. Error otherwise. |
| `repeat` / `yoyo` / `repeatDelay` | **Forbidden on scrub.** Error if present. Valid on `time` and scroll-observer (`scroll`+`scrub:false`). |
| `delay` | **Forbidden on scrub.** Valid on `time` and observer. **Known GSAP-community caveat, not independently verified**: on observer with multi-action `toggleActions`, `delay` reportedly applies on enter/enterBack but is skipped on leave/leaveBack. Not a concern for simple `"play none none none"`. |
| track-level `duration` | **Forbidden on scrub** — checked per-track, error cites the offending track's `id`. |

Scroll-scrub extras (pass-through, not separately validated here): `pin`, `pinSpacing`, `snap`.

### 3.2 `timelineId` / `primary` grouping (`timeline-group.js`)

- Grouped by `driver.timelineId`, ignoring motions with none.
- **All members of a group must share identical `trigger.type`**, and if `type === "scroll"`, identical `scrub` too. Mismatch → error, every offending motion flagged.
- **No observer (`scroll` + `scrub:false`) may ever join a group** — error, even if every other member matches. ScrollTrigger must own its own top-level trigger; nesting removes exactly what makes it an observer.
- **Exactly one `primary: true` per group.** Zero or 2+ → error on every member of that group.
- **Non-primary members cannot declare**: `start`, `end`, `pin`, `pinSpacing`, `snap`, `repeat`, `yoyo`, `repeatDelay` on their own `trigger`. These are primary-only fields; the primary's values apply to the whole nested group.

---

## 4. `templates[]`

```json
{
  "templateId": "enemyPathTemplate",
  "duration": 2,
  "transformOrigin": "50% 50%",
  "keyframes": { /* same shape as track.keyframes */ }
}
```

| Field | Required | Notes |
|---|---|---|
| `templateId` | **yes** | String, unique project-wide. |
| `duration` | no | Inherited by a referencing track unless the track overrides it. |
| `transformOrigin` | no | Same inheritance rule. |
| `keyframes` | no | Same shape as `track.keyframes` — see §5. |

**Forbidden on every template** (build-time error if present) *(`motion-structure.js`)*: `driver`, `timelineId`, `primary`, `trigger`. Templates are pure keyframe fragments — no trigger/grouping concept applies to them directly; only the track that references them (via a real motion) has a driver.

Referenced only via `track.use: "<templateId>"`. Referencing a non-existent `templateId` is a build-time error.

### Track + template merge (`templateResolver.js`, verified via direct source read)

```
resolveTrack(track, templates):
  template = templates.find(t => t.templateId === track.use)   // if track.use present
  duration        = track.duration ?? template.duration
  transformOrigin = track.transformOrigin ?? template.transformOrigin
  keyframes       = { ...template.keyframes, ...track.keyframes }  // per-KEY overwrite
```

**Critical: the keyframes merge is whole-property-key replacement, not a per-stop deep merge.** If both the template and the track's own `keyframes` define `scale`, the track's entire `scale.stops` array wins outright — there is no per-stop splicing between template stops and track stops for the same property key. If the track defines a *different* key than the template touches (e.g. template has `x`/`y`, track adds `filter`), both survive — the merge is `{...template, ...track}` at the top level of the `keyframes` object, so it's key-by-key overwrite-or-add, never partial-array merge within a single key.

`duration` and `transformOrigin` are simple `??` fallbacks (track wins if present at all, otherwise template's value, otherwise `undefined`) — not deep-merged, not overridable per-field-inside-them (they're scalars/strings, this is moot for them specifically, noted for completeness).

---

## 5. `track` (inside `motion.tracks[]`)

```json
{
  "id": "heroCard",
  "use": "enemyPathTemplate",
  "duration": 2,
  "transformOrigin": "50% 50%",
  "keyframes": { "x": { "stops": [...] }, "path": { "points": [...], "stops": [...] } }
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | **yes** (practically) | String. **Project-wide unique** — across ALL motions, regardless of driver type or `sectionId`. Duplicate → error listing every colliding motion index. *(`element-uniqueness.js`)* One flat registry, not scoped per-motion or per-section. |
| `use` | no | References a `templateId`. See §4 for merge semantics. |
| `duration` | no | **Forbidden if the owning motion's trigger is scroll-scrub** (checked per-track in `trigger-shape.js`, error cites the track's own `id`). Valid on `time`/observer. |
| `transformOrigin` | no | e.g. `"50% 50%"`. |
| `keyframes` | no (but pointless without it) | Flat object — each key is an animatable property. See §6. |

---

## 6. `keyframes` — Property Reference

Every animated property requires **`>= 2` stops** — enforced project-wide regardless of property type *(`stop-count.js`)*. Each stop:

```json
{ "p": 0.0, "v": 0, "ease": "power2.out" }
```
`p` = progress 0–1, `v` = value (number or string depending on property), `ease` = optional, applies to the segment leading into this stop.

### 6.1 Simple numeric properties (`createSimplePropertyPlugin`, keys from `plugins.js`)

```
x, y, z, rotation, rotationX, rotationY, scaleX, scaleY, skewX, skewY, opacity
```
Map directly to GSAP. No special validation beyond the universal stop-count rule.

### 6.2 Color properties (`createColorPropertyPlugin`)

```
backgroundColor, color, borderColor
```
`v` is a color string. Same stop-count rule, no extra validation.

### 6.3 Filter properties — consolidated (`filterGroupPlugin`, `filterProperty.js`)

```
blur, brightness, contrast, saturate
```
All four are owned by **one plugin**, not four separate ones (Brief 10, confirmed implemented). Each still tweens independently via the normal keyframes mechanism, but `compose()` merges whatever subset is present into a single **plain numeric object**: `{ filter: { blur: 4, brightness: 1.1 } }` — **not** a CSS string. CSS stringification (`"blur(4px) brightness(1.1)"`) happens only in `domRenderer.js` (§8), never inside `compose()` itself. This is what makes the patch renderer-agnostic (portable to a hypothetical Flutter/Canvas renderer without touching the plugin).

### 6.4 CSS custom properties (`cssVarProperty.js`)

Any key starting with `--` (e.g. `--glow-opacity`) is claimed dynamically — not a fixed list. `v` is whatever string/number the custom property expects. **No equivalent concept outside CSS** — an honest non-DOM renderer simply no-ops on unrecognized `--*` keys, same as Lottie players skipping unimplemented effect types.

### 6.5 `path`

```json
"path": {
  "points": [
    { "x": 0, "y": 0 },
    { "x": 100, "y": 50, "ctrlX": 60, "ctrlY": 10 }
  ],
  "stops": [ { "p": 0, "v": 0 }, { "p": 1, "v": 1 } ],
  "autoRotate": true
}
```

- **`points` is a raw waypoint array, not a pre-converted cubic Bézier array.** `pathPlugin.js` converts internally via `convertToCubicPath()` at build time — do not pre-convert. *(`path-shape.js`)*
- `points` needs **≥ 2 waypoints**.
- Each point needs numeric `x`/`y`. `z` optional (3D — triggers the `perspective` warning if used without root `perspective`).
- `ctrlX`/`ctrlY` must be provided **together or not at all** (mismatched pair → error).
- `ctrlX`/`ctrlY` on the **first** point → warning (no preceding segment to curve, has no effect).
- `path.stops[].v` is **progress along the path**, not a raw value — must satisfy `0 <= v <= 1`.
- `autoRotate` — boolean.
- **Mutually exclusive with `x`/`y` on the same track** — having both `path` and explicit `x`/`y` keyframes is a build-time error. *(`path-xy-exclusivity.js`)*

### 6.6 `imageSequence`

```json
"imageSequence": {
  "frames": ["/frame0.png", "/frame1.png", "/frame2.png"],
  "stops": [ { "p": 0, "v": 0 }, { "p": 1, "v": 2 } ]
}
```

- `frames` required, non-empty array of strings (frame URLs).
- `stops[].v` is a **frame index**, must be an integer-valued number satisfying `0 <= v <= frames.length - 1`. Out-of-range → error citing the exact valid range.
- `stops[].p` must be a number (standard progress semantics).
- The `stops.length >= 2` rule is **not** re-checked here — ownership fully belongs to the universal `stop-count.js` rule (this was a deliberate de-duplication fixed in an earlier session; don't re-add a local length check to this file).

### 6.7 Lazy / Club-plugin properties (stubs only, not yet implemented)

```
splitText, morphSVG, drawSVG, scrambleText
```
Registered in `plugins.js` with `lazy: true` and empty `contribute()` — present in the plugin registry so `resolvePluginForKey` recognizes the keys, but not functionally built out. Roadmap item, not currently usable.

---

## 7. Runtime API (driver-type-specific)

Both `ProductionEngine` and `EditorEngine` expose:

| Method | Valid on | Throws when |
|---|---|---|
| `mountTimeline(motionId)` | `driver.type:"timeline"` only | Motion not found, or motion is `driver.type:"delegate"` (`mountTimeline: cannot mount delegate motion "X".`) |
| `resolveMotion(motionId, progress, overrides?)` | `driver.type:"delegate"` only | Project not loaded; (implicitly, by construction) never called against a timeline motion in current usage — no explicit reverse-guard found, but semantically delegate-only |
| `pauseTimer(id)` / `playTimer(id)` | Grouped (`timelineId`) or individual `time`/observer motions | `no group or motion found for id "X"` |
| `subscribe(trackId, callback)` | DOM-rendered (`driver.type:"timeline"`) tracks | — |
| `compose(trackId, rawData)` | DOM-rendered tracks (used by `useMotionSubscriber`) | — |
| `enableScroll()` / `disableScroll()` | — | — |
| `destroySection(sectionId)` | Motions with a matching `driver.sectionId` (delegate motions never match — they never have one) | — |

### `resolveMotion(motionId, progress, overrides?)` — return shape

Always `Record<trackId, DOMPatch>` — **keyed by track id regardless of track count**, even for a single-track motion. Deliberate: adding a second track to an existing delegate motion later needs zero caller-side restructuring.

`overrides` shape: keyed by track id, same shape as a track-level override object (`{ duration?, transformOrigin?, keyframes? }`). Keyframes merge is the **same whole-key-replacement rule as §4** — not per-stop.

**Caching contract** (implementation detail, but load-bearing for perf):
- No `overrides` passed → tween built once per `(motionId, trackId)` pair, cached, reused via `.progress()` on every subsequent call.
- `overrides` passed → cache bypassed entirely, tween built fresh and killed immediately after every call. Deliberate — overrides can differ per call/instance (e.g. a per-shot projectile arc), so caching would risk serving a stale tween built for a different override.

**Error behavior:** a plugin's `compose()` throwing during `resolveMotion` propagates with full context: `motion "X", track "Y", property key(s) [Z]: <original error>` — never silently swallowed.

---

## 8. Renderer Boundary (Brief 10, confirmed implemented)

`compose()` (both the DOM-path `engineCore.compose()` and `resolveMotion`'s own compose step) returns a **renderer-agnostic-numeric** patch — plain numbers and structured objects, no CSS strings, no `gsap.set()` calls anywhere inside plugin code or `compose()` itself.

`src/lib/renderers/domRenderer.js` is the **only** place that:
- Serializes the `filter` sub-object into a CSS string (`"blur(4px) brightness(1.1)"`)
- Calls `gsap.set()` on a real DOM element

`useMotionSubscriber` delegates to `domRenderer(target, patch)` rather than calling `gsap.set()` directly. `resolveMotion.js` correctly does **not** import `domRenderer` — its callers (game loops, headless consumers) want the numeric patch, not a DOM-targeted one.

This is what makes a hypothetical non-DOM renderer (Flutter, Canvas, Pixi) a matter of writing one new renderer function consuming the same numeric patch shape — no schema or plugin changes required.

---

## 9. Explicitly Deferred / Not in Schema

Carried forward from v1, still true in v2 (verified: no evidence of any of these existing in `v2` source):

- Responsive/breakpoint variants (`gsap.matchMedia()`-equivalent schema concept).
- Presets (value presets like ease curves; pattern presets like reusable `stops` shapes).
- Inter-motion custom offset/overlap within a `timelineId` group beyond GSAP's default sequential-by-declaration-order.
- An imperative/event-fired trigger type (`"event"`) for UI cases like toast queues where instance cardinality isn't known at load time — discussed, not built. Two workarounds exist today: author N reusable `time` motions in advance and invoke via `playTimer`, or (unbuilt) a manually-fired `"event"` trigger type.
- Physics/velocity-driven or blend-tree motion. MotionPath is an authored-keyframe engine only — out of scope by design, not an oversight (use Spine/DragonBones/custom code instead).

---

## 10. Resolved Issues (kept for history — both confirmed fixed)

Two implementation-level gaps were found, fixed, and verified via fresh clone
(`v2` @ `bcbc46f`, 228/228 tests, 35 files). Recorded here so future readers
don't need to re-derive the history if either regresses:

- **`engineCore.compose()`/`resolveMotion` merge logic was duplicated and had
  drifted** — silent-swallow vs. throw-with-context, flat-overwrite vs.
  merge on `filter`. Fixed by extracting a shared `src/lib/composePatch.js`,
  used by both call sites. Both behaviors (throw, filter-merge) now have
  dedicated tests, including one specifically covering the DOM path
  (`engineCore.test.js`), which previously had no test that would have caught
  the old silent-swallow behavior.
- **Delegate-driver tracks were eagerly built into a throwaway GSAP timeline
  at `loadProject()` time**, duplicating the real tween `resolveMotion`
  builds and caches on first use. Fixed by filtering `driver.type !== "delegate"`
  before `buildProject`'s per-motion loop, rather than branching inside it.
  One accepted, intentional side effect: `EditorEngine.setProgress()` called
  with a delegate `motionId` now throws `no group or motion found` (previously
  silently succeeded against the orphaned, unused tween) — confirmed via a
  dedicated test in `EditorEngine.test.js`.
