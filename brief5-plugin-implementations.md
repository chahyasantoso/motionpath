# MotionPath — Brief 5: Per-Plugin contribute()/compose() Implementations

**Audience:** AI coding agent (Gemini Flash) implementing directly against the plugin contract already established in `lib/builder.js` (Brief 2) and `lib/compose.js` (Brief 3 shared utilities).
**Precondition:** Brief 2 (builder), Brief 3 (ProductionEngine + shared utilities), and Brief 4 (EditorEngine) are implemented and verified. Do not modify `builder.js`, `compose.js`, `timelineResolver.js`, `ProductionEngine.js`, or `EditorEngine.js` in this brief.
**Scope:** implement the core plugin set. Each plugin is one file, exporting one object with a fixed shape. No shared base class, no plugin-to-plugin calls.

---

## §0 — Warning: known failure modes for fast/cheap models

1. **Do not make plugins call each other.** Each plugin's `contribute()` operates only on its own property's stops. If two plugins need to interact (e.g. filter consolidation), that happens in the shared `compose()` from Brief 3 — NOT by one plugin importing another.

2. **Do not write `filter` directly from any plugin's `compose()`.** `blurPlugin`, `brightnessPlugin`, `contrastPlugin`, `saturatePlugin` each write ONLY their own synthetic proxy key (`__blur`, `__brightness`, `__contrast`, `__saturate`) inside `contribute()`'s `percentPatch`. None of them write to `domNode.style.filter` — that consolidation already exists in the shared `compose()` (Brief 3). If you find a plugin file referencing `style.filter` or `domNode` at all inside `contribute()`, that's a contract violation — `contribute()` never touches the DOM, only `getNaturalValue()` does.

3. **Do not duplicate the five near-identical `contribute()` bodies.** `x`, `y`, `z`, `rotation`, `rotationX`, `rotationY`, `scaleX`, `scaleY`, `skewX`, `skewY` all share the exact same `contribute()` shape (each stop's `p` becomes a percent key, each stop's `v` becomes that property's value, `ease` passed through unchanged). Write ONE shared factory function, e.g. `createSimplePropertyPlugin(propKey, unit)`, and call it once per property. Five to ten copy-pasted `contribute()` bodies is the exact DRY violation already flagged in Round 3 review — do not reintroduce it here.

4. **`getNaturalValue()` reads the DOM, `contribute()` never does.** Keep this boundary sharp: `getNaturalValue(propKey, domNode)` is the ONLY function in any plugin allowed to touch `domNode` (via `getComputedStyle` or similar). `contribute()` receives already-resolved stops and returns pure data — no DOM access, no side effects, testable without jsdom.

5. **Path plugin: do not use MotionPathPlugin.** This was already rejected — measured 121px max positional drift against per-segment keyframe pacing. Use the custom `__pathProgress` + `points` + `getPointOnCubicPath()` approach specified below. If your implementation imports `MotionPathPlugin` from `gsap/MotionPathPlugin`, that is a reintroduction of a previously-rejected approach — stop and re-read this section.

6. **CSS custom properties (`--any-custom-property`): no unit assumption, no type coercion.** Pass the raw string value straight through. Do not try to parse or validate the value — the schema explicitly defines these as "no cross-platform equivalent, no-ops on unrecognized engines," meaning validation is out of scope here.

7. **Color properties (`backgroundColor`, `color`, `borderColor`): let GSAP handle interpolation.** GSAP's keyframes mechanism already interpolates color strings natively (hex, rgb, named colors) when passed as plain string values in `percentPatch`. Do not write custom color-interpolation logic — that would duplicate GSAP's own CSSPlugin behavior and risk producing different (wrong) intermediate colors than GSAP's native tweening.

If uncertain whether a plugin needs special-case logic, check §0.3 first — most properties in this schema are simple pass-through and belong in the shared factory, not a bespoke plugin.

---

## Plugin contract (fixed shape, do not deviate)

```js
export const somePlugin = {
  keys: ['propName'],           // property key(s) this plugin handles
  lazy: false,                  // true only for plugins needing async load (none in this core set)
  getNaturalValue(propKey, domNode) {
    // Read current/default value from domNode. Called only during direction
    // resolution (Brief 2's resolveDirection). Pure read, no writes.
  },
  contribute(propKey, stops, element) {
    // stops: array of { p, v, ease? } — already direction-resolved by builder.js.
    // Returns { percentPatch, tweenVars }.
    // percentPatch: { "0%": { key: value, ease }, "50%": {...}, ... }
    // tweenVars: {} unless this plugin needs a GSAP tween-level option
    //            (e.g. transformOrigin — but that's an Element-level field,
    //            not a plugin concern; check before adding tweenVars here).
    // NO DOM ACCESS. Pure function of (propKey, stops, element).
  }
};
```

---

## Group 1 — Simple transform/numeric properties (one shared factory)

**Properties:** `x`, `y`, `z`, `rotation`, `rotationX`, `rotationY`, `scaleX`, `scaleY`, `skewX`, `skewY`, `opacity`.

**File:** `lib/plugins/simpleProperty.js`

```js
export function createSimplePropertyPlugin(propKey) {
  return {
    keys: [propKey],
    lazy: false,
    getNaturalValue(key, domNode) {
      const computed = getComputedStyle(domNode);
      // x/y/z/rotation*/scale*/skew* have no single natural CSS read-back
      // (they're transform components) — use gsap.getProperty for correctness:
      return gsap.getProperty(domNode, key) ?? 0;
    },
    contribute(key, stops) {
      const percentPatch = {};
      stops.forEach(stop => {
        const pctKey = `${stop.p * 100}%`;
        percentPatch[pctKey] = { [key]: stop.v };
        if (stop.ease) percentPatch[pctKey].ease = stop.ease;
      });
      return { percentPatch, tweenVars: {} };
    }
  };
}
```

**File:** `lib/plugins/index.js` (or wherever `resolvePluginForKey` already lives per Brief 2 — check existing file before creating a new one)
```js
import { createSimplePropertyPlugin } from './simpleProperty.js';

const simpleKeys = ['x', 'y', 'z', 'rotation', 'rotationX', 'rotationY', 'scaleX', 'scaleY', 'skewX', 'skewY', 'opacity'];
const simplePlugins = Object.fromEntries(simpleKeys.map(k => [k, createSimplePropertyPlugin(k)]));
```

Opacity uses the same shared factory — its natural value defaults to `1` via `gsap.getProperty`, no special case needed.

---

## Group 2 — Color properties (shared factory, string pass-through)

**Properties:** `backgroundColor`, `color`, `borderColor`.

**File:** `lib/plugins/colorProperty.js`

```js
export function createColorPropertyPlugin(propKey) {
  return {
    keys: [propKey],
    lazy: false,
    getNaturalValue(key, domNode) {
      return getComputedStyle(domNode)[key];
    },
    contribute(key, stops) {
      const percentPatch = {};
      stops.forEach(stop => {
        const pctKey = `${stop.p * 100}%`;
        percentPatch[pctKey] = { [key]: stop.v }; // GSAP interpolates color strings natively
        if (stop.ease) percentPatch[pctKey].ease = stop.ease;
      });
      return { percentPatch, tweenVars: {} };
    }
  };
}
```

---

## Group 3 — Filter-family properties (synthetic proxy keys, NOT filter directly)

**Properties:** `blur`, `brightness`, `contrast`, `saturate`.

**File:** `lib/plugins/filterProperty.js`

```js
const filterKeyMap = { blur: '__blur', brightness: '__brightness', contrast: '__contrast', saturate: '__saturate' };
const naturalDefaults = { blur: 0, brightness: 1, contrast: 1, saturate: 1 };

export function createFilterPropertyPlugin(propKey) {
  const proxyKey = filterKeyMap[propKey];
  return {
    keys: [propKey],
    lazy: false,
    getNaturalValue(key) {
      return naturalDefaults[key]; // identity value — no DOM read, per schema:
      // "identity value for synthetic proxy fields with no DOM representation"
    },
    contribute(key, stops) {
      const percentPatch = {};
      stops.forEach(stop => {
        const pctKey = `${stop.p * 100}%`;
        percentPatch[pctKey] = { [proxyKey]: stop.v };
        if (stop.ease) percentPatch[pctKey].ease = stop.ease;
      });
      return { percentPatch, tweenVars: {} };
    }
  };
}
```

Filter consolidation into a single `filter` CSS string happens ONLY in `lib/compose.js` (already implemented in Brief 3) — do not reimplement it here.

---

## Group 4 — Path plugin (bespoke, not shared)

**Property:** `path` (object with `points` + `stops`, `v` constrained to `[0,1]`).

**File:** `lib/plugins/pathPlugin.js`

```js
export const pathPlugin = {
  keys: ['path'],
  lazy: false,
  getNaturalValue() {
    return 0; // __pathProgress natural value — start of path
  },
  contribute(propKey, stops, element) {
    // stops here are the path's OWN stops (v in [0,1] = fractional progress
    // along points), NOT direction-resolved the same way as other properties
    // — path stops are validated separately per schema (path-shape rule).
    const percentPatch = {};
    stops.forEach(stop => {
      const pctKey = `${stop.p * 100}%`;
      percentPatch[pctKey] = { __pathProgress: stop.v };
      if (stop.ease) percentPatch[pctKey].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  }
};
```

**Path resolution (belongs in `lib/compose.js`, not here — cross-reference only):**
`compose()` reads `proxy.__pathProgress` + `element.keyframes.path.points` (static, not proxy-carried) and resolves via `getPointOnCubicPath()` into `{x, y, z, rotation}`. If `getPointOnCubicPath()` doesn't exist yet, implement it as a new file `lib/pathMath.js` — cubic Bézier point + tangent-angle calculation, given 4+ control points and a `[0,1]` progress value. This is the ONE piece of new shared math needed by this brief; put it in its own file so it's independently testable.

**File:** `lib/pathMath.js`
```js
export function getPointOnCubicPath(points, progress) {
  // points: [{x,y,z?}, ...] where (points.length - 1) % 3 === 0, length >= 4
  // Segment the path into (points.length - 1) / 3 cubic Bézier curves.
  // Map progress [0,1] to the correct segment + local t, evaluate the
  // cubic Bézier position, and derive rotation from the tangent angle
  // (atan2 of the derivative) if the caller needs rotation.
  // Return { x, y, z, rotation }.
}
```

---

## Group 5 — CSS custom properties (raw pass-through, no plugin needed per-property)

**Property pattern:** any key starting with `--`.

**File:** `lib/plugins/cssVarProperty.js`

```js
export const cssVarPlugin = {
  keys: [], // matched dynamically — see resolvePluginForKey note below
  lazy: false,
  getNaturalValue(propKey, domNode) {
    return getComputedStyle(domNode).getPropertyValue(propKey) || '';
  },
  contribute(propKey, stops) {
    const percentPatch = {};
    stops.forEach(stop => {
      const pctKey = `${stop.p * 100}%`;
      percentPatch[pctKey] = { [propKey]: stop.v }; // raw string, no coercion
      if (stop.ease) percentPatch[pctKey].ease = stop.ease;
    });
    return { percentPatch, tweenVars: {} };
  }
};
```

**Note on `resolvePluginForKey`:** CSS custom properties are unbounded (`--anything`), so `resolvePluginForKey` (already implemented in Brief 2 — check before modifying) needs a fallback branch: if `propKey.startsWith('--')`, return `cssVarPlugin` regardless of exact name, instead of requiring an exact `keys` match like every other plugin. Confirm this fallback exists; if `resolvePluginForKey` currently only does exact `keys` array matching, add the `--` prefix check as the last fallback branch, after all exact matches fail.

---

## Explicitly not doing here

- `x`/`y` vs `path` mutual exclusivity enforcement — that's a validator rule (Brief 1, already implemented), not a plugin concern.
- Ease-collision detection — that's the builder's job (Brief 2, already implemented), plugins just pass `ease` through unchanged.
- `splitText`, `morphSVG`, `drawSVG`, `scrambleText` — explicitly deferred, lazy-loaded plugins for a future brief, not in this core set.

**Files summary:**
- `lib/plugins/simpleProperty.js` (+ factory usage in existing plugin registry file)
- `lib/plugins/colorProperty.js`
- `lib/plugins/filterProperty.js`
- `lib/plugins/pathPlugin.js`
- `lib/pathMath.js`
- `lib/plugins/cssVarProperty.js`

**Tests:** `lib/plugins/__tests__/*.test.js` (one test file per group above)
- Simple property: `contribute()` maps stops to correct percent keys, `ease` passed through, `getNaturalValue` calls `gsap.getProperty` correctly (mock it).
- Color property: string values pass through unchanged in `percentPatch`, no parsing/coercion applied.
- Filter property: writes to the correct synthetic proxy key (`__blur` etc.), NEVER to `filter` directly (assert `percentPatch` values don't contain a `filter` key at all).
- Path plugin: `__pathProgress` correctly set per stop; `getPointOnCubicPath()` tested independently in `lib/__tests__/pathMath.test.js` with known control points and progress values, asserting exact `{x,y,z,rotation}` output (use a simple straight-line 4-point case where the expected output is easy to hand-calculate, plus one curved case).
- CSS var: `resolvePluginForKey('--custom-prop')` returns `cssVarPlugin` via the fallback branch; exact-match plugins still resolve correctly for named properties (regression check that the fallback doesn't shadow real matches).

## Regression checklist

- [ ] Grep all plugin `contribute()` functions for `domNode` — zero matches (contribute never touches DOM).
- [ ] Grep all plugin files for `style.filter` — zero matches outside `lib/compose.js`.
- [ ] Grep plugin files for `MotionPathPlugin` — zero matches.
- [ ] `simpleProperty.js` factory used for all 11 listed properties — no individual copy-pasted plugin objects for any of them.
- [ ] Full test suite passes.
