# Brief 11 — Schema v2: `scenario→motion` / `elements→tracks` Rename + `driver` (timeline/delegate) + `templates`

Status: ready for implementation. Depends on Briefs 1–9 (all confirmed implemented, `claude-edit` branch).

---

## 0. Step 0 — Verification Gate (run before touching any code)

```bash
git clone https://github.com/chahyasantoso/motionpath.git
cd motionpath && git checkout claude-edit
npm install
npm test   # confirm 198/198 passing baseline before starting
grep -rn "scenario" src/ | wc -l
grep -rn "sceneId" src/ | wc -l
grep -rn "elements\[" src/ | wc -l
```
Record these counts. They are the "before" baseline — every one of these call sites must be accounted for (renamed or deliberately left, e.g. in old test fixtures being deleted) by the end of this brief.

---

## 1. Purpose

Two independent things are happening in this brief. Do not conflate them:

1. **Pure rename** (mechanical, no behavior change): `scenario` → `motion`, `elements` → `tracks`, `scenarioId`-style references → `motionId`, `sceneId` → `sectionId`. `sectionId` is retained conceptually (default trigger anchor + same-section grouping key) but now lives inside `driver`, not at `motion` level — see §3.
2. **New capability**: `driver` field on every motion (`"timeline"` or `"delegate"`), a top-level `templates[]` construct, and a `resolveMotion()` runtime API for game/headless use cases (enemy paths, hit-flash, anything driven by an external progress source instead of GSAP's own trigger).

Rename touches every existing file that mentions the old vocabulary. New capability only adds code paths; it does not modify existing timeline-driver behavior.

---

## 2. Non-Goals (explicit)

- **No change to trigger semantics.** `scroll`/`time` trigger shapes, `pin`/`pinSpacing`/`snap`/`endTrigger`/`toggleActions`/`repeat`/`yoyo`/`repeatDelay`/`delay` validation rules — all unchanged, just now nested one level deeper under `driver.type: "timeline"`.
- **No change to `timelineId`/`primary` grouping rules** (same-trigger-type-only, exactly-one-primary, observer-can-never-group) — same rules, same field names, just scoped to `driver.type: "timeline"` motions only.
- **No template-to-template references.** A template cannot `use` another template. Flat only.
- **No progress-source binding.** `driver: { type: "delegate" }` never auto-subscribes to anything. The `source` metadata field (if included) is documentation only, read by nobody at runtime. The caller (game engine) always supplies progress explicitly via `resolveMotion()`.
- **No per-track independent progress within one `resolveMotion()` call.** All tracks in one delegate motion share the single `progress` argument passed to `resolveMotion()`. If two tracks genuinely need different progress sources, they belong in two separate motions, not one.
- **No `stagger` on delegate motions.** Build-time error if present — see §5.
- **No `sectionId` on delegate motions.** `sectionId` lives inside `driver.timeline` only — it has no meaning without a trigger to anchor. Build-time error if present on a delegate driver — see §5.
- **No narrowing of track-ID uniqueness scope.** v1's element-uniqueness rule is project-wide (Session 4, verified via grep — not the stale per-`sceneId` wording in the old architecture doc). This brief must not reintroduce per-motion or per-`sectionId` scoping under any framing.
- **No editor UI changes in this brief.** `EditorEngine` wiring for delegate motions is out of scope; this brief only adds the schema + builder + `resolveMotion` API.

---

## 3. Schema Delta

```json
{
  "schemaVersion": 2,
  "projectId": "towerDefenseDemo",
  "perspective": 800,
  "templates": [],
  "motions": []
}
```

### `templates[]`

```json
{
  "templateId": "path.enemy.basic",
  "duration": 0.6,
  "transformOrigin": "50% 50%",
  "keyframes": { "...": "same shape as v1 element keyframes" }
}
```
- `templateId` unique globally.
- Allowed fields: `duration`, `transformOrigin`, `keyframes` only.
- Forbidden fields: `driver`, `timelineId`, `primary`, `trigger`, any trigger-adjacent field. Build-time error if present.
- Never resolved directly at runtime — only referenced via `track.use`.

### `motions[]`

```json
{
  "motionId": "heroIntro",
  "driver": {
    "type": "timeline",
    "sectionId": "heroSection",
    "trigger": { "type": "scroll", "scrub": true, "start": "top top", "end": "+=1200" },
    "timelineId": "heroIntro-master",
    "primary": true
  },
  "stagger": 0.15,
  "tracks": [
    { "id": "title", "use": "clip.fadeUp" }
  ]
}
```

```json
{
  "motionId": "enemy.goblin",
  "driver": { "type": "delegate" },
  "tracks": [
    { "id": "movement", "use": "path.enemy.basic" },
    { "id": "hitFlash", "use": "clip.flashRed" }
  ]
}
```

- `motionId` unique globally (was `sceneId`-adjacent implicit uniqueness in v1; now explicit).
- `driver` required. `driver.type` is `"timeline"` or `"delegate"`, no other value.
- `tracks` required, minimum 1 entry, regardless of driver type. No arity special-casing.
- `stagger` optional, valid only on `driver.type: "timeline"`.

### `driver`

**Timeline** (all v1 trigger/timelineId/primary rules apply unchanged, just nested; `sectionId` now lives here — was v1's `sceneId`):
```json
{
  "type": "timeline",
  "sectionId": "optional-string",
  "trigger": { "...": "v1 shape, unchanged" },
  "timelineId": "optional-string",
  "primary": true
}
```
`sectionId` is optional, same meaning as v1's `sceneId`: default trigger anchor when `trigger` doesn't declare its own `startTrigger`/`endTrigger`, and the grouping key for the cross-motion track-uniqueness rule (§5). Only valid inside `driver.type: "timeline"` — it has no meaning without a trigger to anchor.

**Delegate**:
```json
{ "type": "delegate" }
```
or, with optional documentation-only metadata:
```json
{ "type": "delegate", "source": "game.enemy.progress" }
```
`source` is never read by the engine. It exists purely so a human or an LLM authoring the schema can record intent.

### `track`

```json
{ "id": "movement", "use": "path.enemy.basic" }
```
or inline (no template):
```json
{ "id": "title", "keyframes": { "...": "..." } }
```
or `use` + local override:
```json
{ "id": "bossAura", "use": "clip.pulse", "keyframes": { "scaleX": { "stops": [...] } } }
```
- `track.id` unique **project-wide** — across every motion, regardless of `driver.type`. This matches v1's actual locked behavior (element-uniqueness was reworked project-wide in Session 4, not per-`sceneId` — the per-`sceneId` wording in the old architecture doc is the known stale docstring, not the real rule). Not scoped to parent motion.
- Merge rule when `use` + local `keyframes` both present: **override at the property-key level, whole-array replacement** — not a per-stop deep-merge. If local `keyframes.scaleX` is present, it fully replaces the template's `scaleX.stops`; any property key not present locally falls through from the template untouched. Same rule for `duration`/`transformOrigin`: local value wins outright if present, otherwise inherit template's.

---

## 4. CORRECT vs WRONG

### Track override merge

```js
// CORRECT — property-key-level replacement
function resolveTrackKeyframes(template, track) {
  const merged = { ...template.keyframes };
  for (const key of Object.keys(track.keyframes ?? {})) {
    merged[key] = track.keyframes[key]; // whole-array swap, not merged
  }
  return merged;
}
```

```js
// WRONG — deep-merging stops arrays by index/percent
function resolveTrackKeyframes(template, track) {
  const merged = { ...template.keyframes };
  for (const key of Object.keys(track.keyframes ?? {})) {
    merged[key].stops = [...merged[key].stops, ...track.keyframes[key].stops]; // silently produces
    // duplicate/conflicting stops instead of a clean override — do not do this
  }
  return merged;
}
```

### `resolveMotion` return shape

```js
// CORRECT — always keyed by trackId, even for a single-track delegate motion
function resolveMotion(motionId, progress, overrides = {}) {
  const motion = getMotion(motionId);
  assertDelegate(motion);
  const result = {};
  for (const track of motion.tracks) {
    const keyframes = resolveTrackKeyframes(getTemplate(track.use), track);
    const patched = applyOverrides(keyframes, overrides[track.id]);
    result[track.id] = composeAtProgress(patched, progress);
  }
  return result; // { movement: {x,y,rotation}, hitFlash: {opacity} }
}
```

```js
// WRONG — collapsing to a flat patch when there's only one track
function resolveMotion(motionId, progress, overrides = {}) {
  const motion = getMotion(motionId);
  if (motion.tracks.length === 1) {
    return composeAtProgress(motion.tracks[0], progress); // caller now has to branch
    // on track count to know the return shape — breaks the "engine owns shape" contract
  }
  // ...
}
```

### Track-uniqueness scope (project-wide, not per-motion or per-`sectionId`)

```js
// CORRECT — one global registry across every motion, regardless of driver.type or sectionId
function validateTrackUniqueness(project) {
  const seen = new Map(); // trackId -> motionId that first claimed it
  for (const motion of project.motions) {
    for (const track of motion.tracks) {
      if (seen.has(track.id)) {
        throw new SchemaError(
          `Track id "${track.id}" is used in both motion "${seen.get(track.id)}" and "${motion.motionId}" — track ids must be unique project-wide`
        );
      }
      seen.set(track.id, motion.motionId);
    }
  }
}
```

```js
// WRONG — scoping the check to sectionId (or to parent motion) silently weakens v1's
// already-verified project-wide rule (Session 4). This is the exact regression to avoid —
// it would let two delegate motions, or two motions with no shared sectionId, reuse a
// track.id undetected.
function validateTrackUniqueness(project) {
  const bySection = new Map(); // grouping by sectionId — WRONG, do not do this
  for (const motion of project.motions) {
    const key = motion.driver.sectionId ?? motion.motionId; // delegate motions fall through
    // to per-motion scoping here, which is even weaker than the already-wrong sectionId scoping
    const seen = bySection.get(key) ?? new Set();
    for (const track of motion.tracks) {
      if (seen.has(track.id)) throw new SchemaError(`duplicate track id within ${key}`);
      seen.add(track.id);
    }
    bySection.set(key, seen);
  }
}
```

### Driver-type validation

```js
// CORRECT — stagger forbidden on delegate, checked once in the consolidated validator
function validateMotion(motion) {
  if (motion.driver.type === "delegate" && motion.stagger !== undefined) {
    throw new SchemaError(`Motion "${motion.motionId}": stagger is not valid on driver.type "delegate"`);
  }
  if (motion.driver.type === "delegate" && motion.driver.trigger !== undefined) {
    throw new SchemaError(`Motion "${motion.motionId}": trigger is not valid on driver.type "delegate"`);
  }
  if (motion.driver.type === "delegate" && motion.driver.sectionId !== undefined) {
    throw new SchemaError(`Motion "${motion.motionId}": sectionId is not valid on driver.type "delegate"`);
  }
  if (motion.tracks.length < 1) {
    throw new SchemaError(`Motion "${motion.motionId}": tracks must have at least 1 entry`);
  }
}
```

```js
// WRONG — silently ignoring stagger instead of throwing
function validateMotion(motion) {
  if (motion.driver.type === "delegate") {
    delete motion.stagger; // hides an authoring mistake instead of surfacing it —
    // matches the exact anti-pattern already rejected for ease-collision handling (Brief docs §5)
  }
}
```

---

## 5. Validation Rules (add to consolidated validator)

- `schemaVersion` must be `2`.
- `templateId` unique globally.
- `motionId` unique globally.
- `track.id` unique within its parent motion.
- Template forbids `driver`, `timelineId`, `primary`, `trigger`.
- `driver` required on every motion; `driver.type` must be `"timeline"` or `"delegate"`.
- `driver.type: "timeline"` → `trigger` required; all v1 trigger rules apply unchanged (pin/snap/endTrigger scrub-only, repeat/yoyo/delay time-or-observer-only, exactly-one-primary per `timelineId` group, observer can never carry `timelineId`).
- `driver.type: "delegate"` → `trigger` forbidden, `sectionId` forbidden, `timelineId` forbidden, `primary` forbidden, `stagger` forbidden. Throw if any present.
- `tracks` required, length ≥ 1, regardless of driver type.
- `track.use` must reference an existing `templateId` if present.
- Track-uniqueness rule (v1's `element-uniqueness.js`) is **project-wide** — no motion carries a `track.id` that's used anywhere else in the project, regardless of `driver.type` or `sectionId`. This is unchanged from v1's actual (Session-4-corrected) behavior — v2 does not weaken it to per-`sectionId` scoping. `sectionId` remains relevant only for trigger-anchor resolution, not for uniqueness scoping.
- `path`/`x`/`y` mutual exclusivity, ease-collision-at-same-percent, single-stop `direction` inference — unchanged, now evaluated per resolved track keyframes (post template+override merge), not per raw schema element.

---

## 6. Runtime API

```ts
interface MotionEngine {
  loadProject(schema): Promise<void>;
  mountTimeline(motionId: string): void;                                   // driver.type === "timeline" only
  resolveMotion(motionId: string, progress: number, overrides?: object): Record<string, DOMPatch>;  // driver.type === "delegate" only
  subscribe(trackId, callback): UnsubscribeFn;   // renamed from elementId
  compose(trackId, data): DOMPatch;              // renamed from elementId
  destroySection(sectionId): void;               // renamed from destroyScene(sceneId)
  destroy(): void;
}
```

- `mountTimeline` on a `delegate` motion → throw.
- `resolveMotion` on a `timeline` motion → throw.
- Engine never runs both modes on the same motion simultaneously — this is enforced by the type check above, not by convention.

---

## 7. Rename Map (mechanical — apply exactly, no judgment calls)

| Old | New |
|---|---|
| `scenario` (schema key, var names, file/test names) | `motion` |
| `scenarioId` (if referenced anywhere as a distinct field) | `motionId` |
| `elements[]` (schema key) | `tracks[]` |
| `element.id` | `track.id` |
| `elementId` (function params, e.g. `subscribe(elementId, ...)`) | `trackId` |
| `validateScenario()` | `validateMotion()` |
| `element-uniqueness.js` (rule file) | keep filename, update internal logic to read `motion.tracks` instead of `scenario.elements`, update the docstring (this closes out the outstanding Session 4 docstring fix-note as a side effect — confirm old stale docstring language doesn't survive) |
| `_elementPlugins: Map<elementId, Plugin[]>` | `_trackPlugins: Map<trackId, Plugin[]>` |
| `sceneId` (schema key, `destroyScene` param, internal var names) | `sectionId` — **also relocate**: moves from motion-level to inside `driver` (only valid under `driver.type: "timeline"`), see §3 |
| `destroyScene(sceneId)` | `destroySection(sectionId)` |

Do **not** rename `timelineId`, `primary`, `trigger`, `stops`, `keyframes`, `path`, or any of the locked property names (`x`/`y`/`z`/`rotation*`/`scale*`/`skew*`/`opacity`/`blur`/`brightness`/`contrast`/`saturate`/`backgroundColor`/`color`/`borderColor`/`--*`). Those are unaffected by this brief.

---

## 8. Verification Checklist (post-implementation, grep-based — run against actual repo, not commit messages)

```bash
# Rename completeness — all five should return 0
grep -rln "\bscenario\b" src/ --include="*.js" | grep -v ".test.js"
grep -rln "elements\[" src/ --include="*.js"
grep -rln "elementId" src/ --include="*.js"
grep -rln "validateScenario" src/
grep -rln "\bsceneId\b" src/ --include="*.js" | grep -v ".test.js"

# New constructs present
grep -rn "driver" src/ | grep -c "type.*timeline\|type.*delegate"
grep -rn "resolveMotion" src/
grep -rn "templates\[" src/
grep -c "templateId" src/**/*.js
grep -rn "sectionId" src/ | grep -c "driver"   # confirm sectionId only appears inside driver, not at motion top level

# Delegate validation actually throws (not silently strips)
grep -A3 "driver.type.*delegate" src/**/validators/*.js | grep -i "throw"
grep -B2 "sectionId" src/**/validators/*.js | grep -i "delegate"   # sectionId-forbidden-on-delegate check present

# Track uniqueness stays project-wide — must NOT find scoping by sectionId or per-motion
grep -n "element-uniqueness\|track.*uniqueness" src/**/validators/*.js
grep -A15 "function validateTrackUniqueness\|element-uniqueness" src/**/validators/*.js | grep -i "sectionId\|motion.motionId.*Set\|bySection"
# ^ any hit here is a regression — uniqueness check must use one flat registry across all motions, not grouped by sectionId or motionId

# Track override merge is whole-key-replace, not stop-level concat
grep -B2 -A5 "resolveTrackKeyframes" src/**/*.js

# Test suite
npm test   # expect 198+ passing — new tests added for delegate/templates should push this number up, not just hold steady
```

Do not consider this brief complete based on Gemini's written summary or commit message — clone, run the greps above, and read the actual diff in `resolveMotion`, `validateMotion`, and the renamed `element-uniqueness.js` before signing off.
