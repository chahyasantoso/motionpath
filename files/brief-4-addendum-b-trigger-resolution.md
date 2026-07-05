# MotionPath — Brief 4, Addendum B: Uniform Trigger-Element Resolution

**Status:** Corrects `ProductionEngine.js`'s trigger-wiring code (§3 of Brief 4). Standalone — implement against this only.

**Problem, found while designing the hook layer:** Brief 4's original wiring code resolves `trigger`/`startTrigger` via `deps.resolveElement()` (the `data-motion-id` lookup) for the observer case, but spreads `pin` and `endTrigger` straight through to `ScrollTrigger.create({ ...config })` untouched, as raw values. That's inconsistent: `pin`/`endTrigger` are the same kind of thing as `trigger`/`startTrigger` — a reference to an element — and leaving them unresolved means an author has to fall back on a real CSS class/id staying stable forever for those two fields specifically, which is exactly the fragility `data-motion-id` exists to prevent. There is no principled reason to resolve one pair and not the other.

**What does *not* change:** `start`/`end` (position syntax like `"top top"`, `"+=2000"`) are not element references in normal usage and are not touched by this addendum. Parsing them for embedded selectors would be speculative complexity with no current use case — explicitly out of scope, see Non-Goals.

---

## 1. The shared resolution rule

One small pure function, used at every wiring site that touches an element-reference trigger field:

```js
/**
 * Resolves a trigger-related field that may reference an element.
 * - undefined/null -> falls back to resolving `fallbackId` (typically sceneId).
 * - boolean -> passed through unchanged (GSAP's `pin: true` means "pin the
 *   trigger element itself"; there's nothing to resolve).
 * - string -> resolved via deps.resolveElement (the data-motion-id lookup) —
 *   never treated as a raw CSS selector, for the same reason element.id isn't.
 */
function resolveTriggerRef(value, deps, fallbackId) {
  if (value === undefined || value === null) return deps.resolveElement(fallbackId);
  if (typeof value === 'boolean') return value;
  return deps.resolveElement(value);
}
```

This lives in `ProductionEngine.js` — it's ScrollTrigger-specific (the boolean special-case only makes sense in GSAP's own `pin` semantics), so it does not belong in `builder.js`, which has zero ScrollTrigger knowledge by design (Brief 2 §7 Non-Goals).

## 2. Apply at every wiring site that has these fields

Per the schema, `pin`/`pinSpacing`/`snap`/`endTrigger` are **scrub-only** — they never appear on `time` or `scroll-observer` triggers. So this only touches the two scrub wiring branches:

**Grouped scrub** (was: `ScrollTrigger.create({ ...primaryTriggerConfig, animation: group.masterTimeline })`):
```js
const resolvedConfig = {
  ...primaryTriggerConfig,
  trigger: resolveTriggerRef(primaryTriggerConfig.trigger ?? primaryTriggerConfig.startTrigger, deps, primaryScenario.sceneId),
};
if (primaryTriggerConfig.pin !== undefined) {
  resolvedConfig.pin = resolveTriggerRef(primaryTriggerConfig.pin, deps, primaryScenario.sceneId);
}
if (primaryTriggerConfig.endTrigger !== undefined) {
  resolvedConfig.endTrigger = resolveTriggerRef(primaryTriggerConfig.endTrigger, deps, primaryScenario.sceneId);
}
const st = ScrollTrigger.create({ ...resolvedConfig, animation: group.masterTimeline });
```

**Ungrouped scrub** (was: `ScrollTrigger.create({ ...triggerConfig, animation: scenario.timeline })`): identical pattern, using `scenario.sceneId` as the fallback instead of `primaryScenario.sceneId`.

**Ungrouped observer:** no change in behavior, but route through the same helper for consistency rather than a separate inline expression:
```js
trigger: resolveTriggerRef(config.trigger ?? config.startTrigger, deps, sceneId),
```

**Grouped/ungrouped time:** untouched — no trigger-element fields exist on time triggers.

## 3. Non-Goals

- Do not resolve `start`/`end` in any way. They stay exactly as spread through today.
- Do not add generic parsing of GSAP's position-string mini-language to detect embedded selectors. No current content uses this; adding it would be unused surface area.
- Do not change `pin`/`endTrigger`'s validity rules (still scrub-only, already enforced by Brief 1's `trigger-shape` rule for `endTrigger`; `pin` is not currently validated as scrub-only by Brief 1 — that's a separate, pre-existing gap, out of scope for this addendum).

## 4. Testing Requirements

- `resolveTriggerRef`: `undefined` → calls `resolveElement(fallbackId)`; `true` → returns `true` unchanged, `resolveElement` never called; `"someId"` → calls `resolveElement("someId")`, fallback never used.
- Grouped scrub wiring: mock `resolveElement`, assert it's called once for `trigger` and once for `pin` when both are strings present in the primary scenario's config, with the correct arguments each time.
- Ungrouped scrub wiring: same shape, using the scenario's own `sceneId`.
- Regression check: `start`/`end` values in the resulting `ScrollTrigger.create()` call are passed through byte-for-byte from the original config — `resolveElement` must never be called with a `start`/`end` value.
