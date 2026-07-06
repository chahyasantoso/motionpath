# MotionPath Schema v1 — Final

Consolidated, canonical schema reference. Supersedes `schrma_v1.0`, `Schema Updates — Session 2`, and the session 3 gap-closure discussion — this document is the single source of truth for v1. No backward compatibility is maintained across schema versions; breaking changes are acceptable pre-v1-stabilization and are tracked via `schemaVersion`.

---

## Top-Level Fields

```json
{
  "schemaVersion": 1,
  "projectId": "iceCreamLanding",
  "perspective": 800,
  "scenarios": [ /* ... */ ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | **yes** | Must equal `1` exactly for this schema generation. No leniency, no version-branching logic — validator rejects any other value outright. |
| `projectId` | string | yes | Author-facing identifier, no engine semantics. |
| `perspective` | number (px) | no | CSS `perspective`, applied once to the root stage container at `loadProject()` time. Omit for no 3D depth. **Validator warns** if any element uses `z`/`rotationX`/`rotationY` while this is absent. |
| `scenarios` | array | yes | The grouping unit — replaces any flat `elements` concept. |

---

## Scenario

```json
{
  "sceneId": "berryScene",
  "timelineId": "berryScene-master",
  "primary": true,
  "trigger": { "type": "time", "duration": 1.2 },
  "stagger": 0.15,
  "elements": [ /* ... */ ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `sceneId` | string | yes | Default trigger element; groups scenarios for the element-uniqueness rule. |
| `trigger` | object | yes | **One trigger type per scenario, no exceptions.** See Trigger below. |
| `timelineId` | string | no | Groups scenarios into one real GSAP master timeline. Only scenarios of **identical trigger type** may share a value (scrub-with-scrub, or time-with-time). Scroll **observer** scenarios can never carry this — build-time error if present. Children nest under the master **in schema-declaration order**, GSAP's default sequential positioning — no offset/overlap field exists in v1 (see Wishlist). |
| `primary` | boolean | no | Exactly one `true` per `timelineId` group. Scrub groups: primary's trigger config (`start`/`end`/`pin`/etc.) is the one real ScrollTrigger; others only declare `type`/`scrub` compatibility. Time groups: primary's `repeat`/`yoyo`/`repeatDelay` apply to the whole nested group. Zero or 2+ per group is a build-time error. |
| `stagger` | number (seconds) | no | Each element's start offset = `index * stagger`, index = declaration order in `elements[]`. Manual per-element positional offset in the build loop — **not** GSAP's native `stagger` vars option (rejected: requires uniform tween shapes across targets, incompatible with our per-element merged keyframe model). Non-negative; validator warns if set with <2 elements. |
| `elements` | array | yes | See Element below. |

**Cross-scenario rule:** two scenarios sharing the same `sceneId` must not reference the same element `id` — build-time error.

---

## Trigger

**One of three shapes, chosen by `type` (+ `scrub` for scroll):**

```json
// 1. Scroll scrubber
{ "type": "scroll", "scrub": true, "start": "top top", "end": "+=2000", "endTrigger": "#next" }

// 2. Scroll observer (fires tween, no scrub)
{ "type": "scroll", "scrub": false, "start": "top center", "toggleActions": "play none none none", "delay": 2 }

// 3. Pure time
{ "type": "time", "duration": 2, "repeat": -1, "yoyo": true, "repeatDelay": 0.5 }
```

| Extra field | Valid on | Notes |
|---|---|---|
| `pin`, `pinSpacing`, `snap` | scrub only | Pure pass-through to GSAP/ScrollTrigger. |
| `repeat`, `yoyo`, `repeatDelay` | time / observer only | **Forbidden on scrub** — build-time error. Progress is a direct function of scroll position; looping is meaningless there. |
| `endTrigger` | scrub only | Forbidden outside `scroll`+`scrub:true` — build-time error. Native GSAP `trigger`/`endTrigger` fields, no custom logic. |
| `delay` | time / observer only | Forbidden on scrub — build-time error. **Known caveat, community-reported, not independently verified:** on observer with multi-action `toggleActions`, applies correctly on enter/enterBack but reportedly skipped on leave/leaveBack. Not a concern for simple `"play none none none"` usage. |

`toggleActions`'s four-state dispatch (enter/leave/enterBack/leaveBack → play/pause/resume/reverse) is fully handled by GSAP internally. Scrub and `toggleActions` are mutually exclusive per GSAP docs — validates the `scrub:true` vs `scrub:false`+`toggleActions` split as GSAP-level, not arbitrary.

---

## Element

```json
{
  "id": "sprinkle1",
  "duration": 0.8,
  "transformOrigin": "50% 50%",
  "direction": "from",
  "keyframes": { /* ... */ }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | **Logical identifier, not a CSS selector.** Resolved via `document.querySelector('[data-motion-id="${id}"]')` at `initScene` time — decouples animation targeting from page styling/structure. Must be unique within a scenario's element list. Missing markup is a **runtime** error (separate validation phase from static schema checks — needs a live DOM). |
| `duration` | number (seconds) | no | Overrides scenario duration; observer/time-scoped only. |
| `transformOrigin` | string | no | e.g. `"50% 50%"`. Direct CSS pass-through. |
| `direction` | `"to"` \| `"from"` \| `"fromTo"` | no | See Direction Resolution below. |
| `keyframes` | object | yes | Flat — each key is an animatable property. |

---

## Direction Resolution

Pre-pass, runs before any plugin's `contribute()`, **per property**:

| Stops | `direction` | Result |
|---|---|---|
| 2+ | any | Ignored — fully explicit already. |
| 1, `p`≈0 | omitted | Inferred `"from"` — natural/current value injected at `p:1`. |
| 1, `p`≈1 | omitted | Inferred `"to"` — natural/current value injected at `p:0`. |
| 1, `p` elsewhere | omitted | **Build-time error** — ambiguous, no positional precedent. |
| 1 | `"fromTo"` | **Build-time error** — needs 2 stops. |

Natural/default value is plugin-supplied: computed CSS style for real properties, identity value (e.g. `0` for blur, `1` for brightness) for synthetic proxy fields with no DOM representation.

---

## Keyframe Properties & Units

```json
"keyframes": {
  "x": { "stops": [ { "p": 0, "v": 0 }, { "p": 1, "v": 200, "ease": "power2.out" } ] },
  "opacity": { "stops": [ { "p": 0, "v": 0 }, { "p": 1, "v": 1 } ] }
}
```

**Stops format:** `p` = progress 0–1, `v` = value (number or string), `ease` = optional, set per-entry.

| Property | Type | Unit |
|---|---|---|
| `x`, `y`, `z` | number | px |
| `rotation`, `rotationX`, `rotationY` | number | degrees |
| `scaleX`, `scaleY` | number | unitless multiplier (1 = 100%) |
| `skewX`, `skewY` | number | degrees |
| `opacity` | number | 0–1 |
| `blur` | number | px (composed as `blur(Npx)` — see Filter Consolidation) |
| `brightness`, `contrast`, `saturate` | number | unitless multiplier (1 = 100%) |
| `backgroundColor`, `color`, `borderColor` | string | any valid CSS color |
| `--any-custom-property` | string | raw CSS value, no unit assumed — no-ops on unrecognized engines (no cross-platform equivalent) |
| `path` | object | see Path below |

`path` and `x`/`y` are **mutually exclusive** per element — build-time error if both present.

**Filter consolidation:** `blur`/`brightness`/`contrast`/`saturate` never write to `filter` directly during tweening — each writes to its own internal proxy field (`__blur`, `__brightness`, etc.). Only `compose()` reads whichever are present and emits one combined `{ filter: "blur(4px) brightness(1.1)" }`.

### Path

```json
"path": {
  "points": [
    { "x": 50, "y": 300 },
    { "x": 400, "y": 100, "ctrlX": 200, "ctrlY": -50 },
    { "x": 900, "y": 350, "ctrlX": 700, "ctrlY": 500 }
  ],
  "stops": [
    { "p": 0, "v": 0, "ease": "power1.in" },
    { "p": 1, "v": 1 }
  ]
}
```

- `points` — **raw waypoints** (`{x, y, z?, ctrlX?, ctrlY?, ctrlZ?}`), minimum 2. **Not** a pre-converted cubic Bézier array — the path plugin's `contribute()` converts internally via `convertToCubicPath()` at build time (quadratic-style control-point elevation to cubic), once per element. Authors/AI agents never construct the cubic form directly; doing so and feeding it in as `points` would be silently double-converted and produce a wrong curve. `ctrlX`/`ctrlY` are optional per waypoint — omit both for a straight segment into that point; providing only one is a validation error. `ctrlX`/`ctrlY` on the first waypoint have no effect (no preceding segment to curve) and are flagged as a warning.
- `stops` — structurally identical to every other property, **except** `v` is constrained to `[0, 1]`, representing fractional progress along the path. Drives synthetic `__pathProgress` through the standard keyframes mechanism; `compose()` resolves `__pathProgress` + the internally-converted cubic path into `{x, y, z, rotation}` via `getPointOnCubicPath()`.
- `autoRotate` (boolean, optional, sibling of `points`/`stops` inside the `path` object) — when `true`, `compose()` also emits `rotation`, aligned to the path's tangent direction at the current progress. Omit or `false` for no automatic rotation.
- `MotionPathPlugin` is explicitly **not used** — empirically measured 121px max positional drift against per-segment keyframe pacing (motionPath tracks its own internal tween time, not the custom property's value).

---

## Ease Collisions

Two properties contributing different `ease` values at the same literal `p` percent → **throw at build time**. No automatic epsilon-nudging. Fix is a schema edit: offset one property's `p` slightly.

---

## Master Timeline Linking — Example

```json
[
  {
    "sceneId": "iceCreamSection",
    "timelineId": "iceCreamSection-master",
    "primary": true,
    "trigger": { "type": "scroll", "scrub": true, "pin": true, "start": "top top", "end": "+=2000" },
    "elements": [ /* cone, scoop1, scoop2, scoop3 */ ]
  },
  {
    "sceneId": "iceCreamSection",
    "timelineId": "iceCreamSection-master",
    "trigger": { "type": "scroll", "scrub": true },
    "elements": [ /* sprinkles, cherry, syrup */ ]
  }
]
```

**Same-section, different-type scenarios (no linking) are separately valid and common** — e.g. one scrub scenario (continuous parallax) + one observer scenario (fire-once reveal) sharing a `sceneId` but never a `timelineId`. Two fully independent GSAP constructs.

---

## Engine Notes (non-schema, for implementers)

- GSAP tweens a **plain per-element proxy object**, never the DOM node directly — synthetic properties (`__blur`, `__pathProgress`) have no DOM equivalent, and the broadcast/compose split depends on a proxy target. `domNode` is used only for `getNaturalValue()` during direction resolution.
- `subscribe(elementId, callback)` broadcasts **raw** proxy values every tick. `compose(elementId, data)` — public method, not hook-internal — runs active plugins' `compose()` and merges into a DOM-ready patch.
- Element `id` → DOM resolution (`data-motion-id`) is a distinct, runtime-only validation phase — separate from static schema validation, since it requires a live DOM.

---

## Wishlist — Explicitly Deferred (no current forcing use case)

- `offset` (relative-GSAP-position-string only, e.g. `"-=0.4"`) — real-seconds overlap for non-primary `timelineId` group members, instead of strict sequential `.add()`. Absolute-number support is free later (GSAP already accepts it natively).
- Named `label` field for cross-scenario sync points — **not** a reuse of `timelineId` (would collide once a group has 3+ members).
- `staggerGroups` — GSAP-native stagger with distribution modes (`from`, `grid`, `random`), only if a real case needs spatial distribution across animation-identical elements.
- Responsive/breakpoint variants (`gsap.matchMedia()`-equivalent).
- Presets (value: ease/color lookup; pattern: reusable `stops` arrays).
- Inter-scenario custom offset/overlap beyond declaration-order sequencing.

Plugin roadmap (not in schema yet): `splitText`, `morphSVG`, `drawSVG`, `scrambleText` — lazy-loaded, module-level promise caching, same `contribute()`/`compose()` contract as core plugins.
