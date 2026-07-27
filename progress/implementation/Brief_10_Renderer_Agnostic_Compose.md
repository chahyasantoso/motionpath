# Brief 10 — Renderer-Agnostic Compose Output + `domRenderer` Extraction

Implements §2 and §3 of `Renderer_Architecture_Decisions.md`. This is the only part of that doc that's in scope right now — everything else there (WebGL, Flutter, particle system) is a constraint for later, not a task.

---

## Goal

`compose()` currently produces DOM-specific output for at least the filter plugin (`blur`/`brightness`/`contrast`/`saturate` merged into a CSS string like `"blur(4px) brightness(1.1)"`). That couples the engine's derivation layer to CSS, contradicting proxy-not-DOM and cross-engine portability. Fix: `compose()` returns numeric/structured values only. The DOM-specific step (turning that into a CSS `filter` string) moves into a new, explicit `domRenderer`.

## Non-goals (do not do any of this)

- No WebGL renderer, no Canvas2D renderer, no Audio renderer, no renderer registry, no renderer plugin system, no abstract `Renderer` base class.
- No Flutter work of any kind.
- No particle system / instancing work.
- No change to `subscribe()` — it already broadcasts raw proxy values, untouched by this brief.
- No change to any plugin other than the filter plugin (`filterProperty.js`) and, conditionally, the color plugin — see step 2 below.
- No change to `compose()`'s two-arg signature (`compose(data, elementCfg)`) — only its _filter-related output shape_ changes.

## Files touched

1. `src/plugins/filterProperty.js` — change compose output from CSS string to numeric object.
2. `src/lib/renderers/domRenderer.js` — **new file**. Owns DOM-specific serialization (stringifying filter values into a CSS `filter` string) and the actual `gsap.set()` call.
3. `src/hooks/useMotionSubscriber.js` — replace inline `gsap.set()` call with a call to `domRenderer`.

---

## Step 1 — `filterProperty.js`: compose returns numeric, not CSS string

Find the current `compose()` implementation for the filter plugin. It currently merges whichever of `blur`/`brightness`/`contrast`/`saturate` are present into one `filter` CSS string.

**WRONG (current behavior — must be removed):**

```js
compose(data, elementCfg) {
  const parts = [];
  if (data.blur !== undefined) parts.push(`blur(${data.blur}px)`);
  if (data.brightness !== undefined) parts.push(`brightness(${data.brightness})`);
  if (data.contrast !== undefined) parts.push(`contrast(${data.contrast})`);
  if (data.saturate !== undefined) parts.push(`saturate(${data.saturate})`);
  return parts.length ? { filter: parts.join(' ') } : {};
}
```

**CORRECT (new behavior — numeric passthrough, grouped but not stringified):**

```js
compose(data, elementCfg) {
  const filterValues = {};
  if (data.blur !== undefined) filterValues.blur = data.blur;
  if (data.brightness !== undefined) filterValues.brightness = data.brightness;
  if (data.contrast !== undefined) filterValues.contrast = data.contrast;
  if (data.saturate !== undefined) filterValues.saturate = data.saturate;
  return Object.keys(filterValues).length ? { filter: filterValues } : {};
}
```

Note the shape change: `compose()` still returns a `filter` key (this is fine — it's still "this element has filter-related composed output"), but the _value_ is now `{ blur: 4, brightness: 1.1 }`, an object, not a string. This keeps the "many raw proxy fields → one grouped output key" derivation logic exactly where it was — only the final stringify step is gone.

**Update existing tests** for this plugin's `compose()` to assert the new object shape, not a string match. Any test currently doing something like `expect(result.filter).toBe('blur(4px) brightness(1.1)')` must become `expect(result.filter).toEqual({ blur: 4, brightness: 1.1 })`.

## Step 2 — Check color plugin (`colorProperty.js`) — investigate before changing

Unlike filter, color properties (`backgroundColor`, `color`, `borderColor`) may not need this change at all — if `compose()` for color is just passing through the raw string value the user supplied in `v` (e.g. `"#ff0000"` or `"rgb(255,0,0)"`), that's not a derivation step, it's the value itself, and CSS color strings are portable-in-meaning already per the existing portability audit (universal parsers exist on other platforms too).

**Action:** grep `colorProperty.js`'s `compose()`. If it does no transformation beyond passthrough of the raw string, leave it untouched — do not force a numeric (e.g. RGB tuple) representation speculatively. If it turns out to be doing real derivation (e.g. interpolating between color stops into a computed string inside `compose()` rather than upstream), flag that back — do not silently change it as part of this brief. This step is investigate-and-report, not investigate-and-fix.

## Step 3 — New file: `src/lib/renderers/domRenderer.js`

This is the DOM-specific renderer function. It takes the (now numeric) composed patch and:

- Converts `filter` (if present, and if it's an object) into the CSS `filter` string.
- Passes every other key through unchanged.
- Calls `gsap.set()`.

```js
// src/lib/renderers/domRenderer.js

function serializeFilter(filterValues) {
  const parts = [];
  if (filterValues.blur !== undefined)
    parts.push(`blur(${filterValues.blur}px)`);
  if (filterValues.brightness !== undefined)
    parts.push(`brightness(${filterValues.brightness})`);
  if (filterValues.contrast !== undefined)
    parts.push(`contrast(${filterValues.contrast})`);
  if (filterValues.saturate !== undefined)
    parts.push(`saturate(${filterValues.saturate})`);
  return parts.join(" ");
}

export function domRenderer(target, patch) {
  const domPatch = { ...patch };

  if (domPatch.filter && typeof domPatch.filter === "object") {
    domPatch.filter = serializeFilter(domPatch.filter);
  }

  gsap.set(target, domPatch);
}
```

Keep this file small and dependency-free beyond GSAP itself. Do not add a renderer registry, do not export anything beyond `domRenderer` (and `serializeFilter` only if a test needs to import it directly — otherwise keep it unexported/internal).

**Add a test file** `domRenderer.test.js` covering: (a) a patch with a numeric `filter` object serializes to the correct CSS string, (b) a patch with no `filter` key passes through unmodified, (c) a patch where `filter` is absent doesn't crash or add a spurious `filter` key to the `gsap.set()` call.

## Step 4 — `useMotionSubscriber.js`: call `domRenderer` instead of inline `gsap.set()`

Find wherever this hook currently does something like:

```js
gsap.set(ref.current, composedPatch);
```

Replace with:

```js
domRenderer(ref.current, composedPatch);
```

Import `domRenderer` from `src/lib/renderers/domRenderer.js`. If the hook currently has a `transformFn` escape hatch (per the documented `compose`-as-second-arg pattern — `transformFn(rawData, compose)`), that behavior is unaffected by this brief: `transformFn`'s own return value, if it bypasses `compose()` entirely or hand-builds a patch, still goes to `gsap.set()`/`domRenderer` the same way it does now. Do not change the `transformFn` contract.

---

## Verification checklist (grep-able)

Run these after Gemini reports completion — do not trust the written summary, verify directly:

1. `grep -rn "blur(" src/plugins/filterProperty.js` → should return **zero hits** in the `compose()` function (string template with `blur(` should no longer exist there). It's fine if `blur(` still appears in `domRenderer.js`.
2. `grep -rn "filter.*join" src/plugins/filterProperty.js` → zero hits (the `.join(' ')` string-assembly logic should have moved entirely to `domRenderer.js`).
3. `grep -rn "gsap.set" src/hooks/useMotionSubscriber.js` → zero hits (should now call `domRenderer(...)` instead).
4. `grep -rn "domRenderer" src/hooks/useMotionSubscriber.js` → at least one hit (the import + the call).
5. `ls src/lib/renderers/domRenderer.js` → file exists.
6. Run full test suite — all existing tests pass, plus new `domRenderer.test.js` tests pass, plus updated `filterProperty` compose tests pass with the new object-shape assertions (not string assertions).
7. `grep -rn "filter:" src/plugins/filterProperty.js` → confirm the returned key is still named `filter` (shape of the _value_ changed, not the key name) — this avoids an unnecessary breaking rename for any other code that might read `data.filter`.
8. Confirm colorProperty.js is either (a) untouched, with a one-line note back to Chahya confirming it was investigated and needs no change, or (b) flagged with the specific transformation found — not silently modified.

## What "done" looks like

- `compose()` for filter properties returns `{ filter: { blur, brightness, contrast, saturate } }` (numeric), never a pre-built CSS string.
- A new, small, dependency-light `domRenderer.js` owns the CSS-string serialization step and the `gsap.set()` call — this is the only place in the codebase that knows filter values need to become a `"blur(4px) brightness(1.1)"`-style string.
- `useMotionSubscriber` no longer calls `gsap.set()` directly; it delegates to `domRenderer`.
- Every other composed property (`x`, `y`, `z`, `rotation`, `opacity`, colors, CSS vars, path-derived transform values) is unaffected — this brief touches exactly the filter plugin's compose output and the render step, nothing else.
