# Plugin Contract

This document defines the **Plugin interface contract** for the MotionPath animation engine. Every plugin object (whether created by a factory function or defined inline) must conform to this shape.

> The codebase is plain JavaScript. This contract is enforced by convention rather than by the TypeScript compiler. A future TS migration would replace this document with a proper `interface Plugin { ... }` declaration.

---

## Required Fields

### `keys: string[]`

A list of the **public schema keys** this plugin handles. Used by the builder when iterating an element's `keyframes` object to decide which plugin to load.

- For most plugins this is a single entry: `keys: ['opacity']`, `keys: ['path']`, etc.
- For `cssVarPlugin` it is `[]` (empty) because CSS custom properties are infinite — key matching is delegated entirely to `claimsKey`.

### `lazy: boolean`

Whether the plugin requires an async load step before it can be used.

- `false` — always ready (all current built-in plugins).
- `true` — the builder calls `plugin.load()` and awaits it before the first `contribute()` call. Reserved for heavy GSAP Club plugins like `SplitText`, `MorphSVG`, etc.

### `claimsKey(key: string): boolean`

Determines whether this plugin **owns** a given data key at **runtime**.

This is the central method for plugin resolution and is the reason the engine stays decoupled from individual plugin details. `claimsKey` must return `true` for:

1. **Public schema keys** — the same strings found in `keys[]`. e.g. `'blur'`, `'path'`.
2. **Private synthetic proxy keys** — internal keys the plugin writes into the proxy object that the engine later reads back. e.g. `'__blur'`, `'__pathProgress'`, `'__cubicPath'`.
3. **Pattern-based keys** — for open-ended namespaces like CSS custom properties where a finite `keys[]` array cannot be maintained.

#### Why `keys.includes(key)` alone is not enough

| Scenario | `keys.includes(key)` | `claimsKey(key)` |
|---|---|---|
| `cssVarPlugin` claiming `'--brand-color'` | ❌ (`keys: []`) | ✅ (`key.startsWith('--')`) |
| `filterPlugin` claiming its proxy key `'__blur'` | ❌ (`keys: ['blur']`) | ✅ |
| `pathPlugin` claiming `'__pathProgress'` | ❌ (`keys: ['path']`) | ✅ |
| `simplePlugin` claiming `'opacity'` | ✅ | ✅ (same result) |

#### Implementations by plugin type

| Plugin | `claimsKey` body |
|---|---|
| `simpleProperty` | `key === propKey` |
| `colorProperty` | `key === propKey` |
| `filterProperty` | `key === propKey \|\| key === proxyKey` (e.g. `'blur' \|\| '__blur'`) |
| `pathPlugin` | `key === 'path' \|\| key === '__pathProgress' \|\| key === '__cubicPath' \|\| key === '__autoRotate'` |
| `cssVarPlugin` | `key.startsWith('--')` |
| Lazy stubs | `key === 'splitText'` (etc.) |

### `getNaturalValue(key, domNode): unknown`

Returns the **baseline value** for the property before any animation begins. The builder uses this as the implicit start/end value when an element only has one stop.

- For GSAP transform properties: use `gsap.getProperty(domNode, key)`.
- For color properties: use `getComputedStyle(domNode)[key]`.
- For synthetic/filter properties (no DOM equivalent): return an identity value — `0` for blur, `1` for brightness/contrast/saturate.

### `contribute(key, stops, element?): ContributeResult`

Translates the **raw keyframe stops** from the schema into a `percentPatch` object that GSAP can animate.

```javascript
// Return shape:
{
  percentPatch: {
    '0%':   { propKey: value, ease?: 'power1.in' },
    '50%':  { propKey: value },
    '100%': { propKey: value },
  },
  tweenVars: {}  // Extra gsap.to() vars if needed (rare)
}
```

- The builder **deep-merges** patches from all plugins on an element, so multiple properties safely contribute to the same percent key.
- The `path` plugin additionally seeds metadata at `0%` (`__cubicPath`, `__autoRotate`) that it needs in `compose()`.

### `compose(rawData): object`

Translates the **current animated proxy state** into a CSS-ready style patch that is passed to `gsap.set(domNode, patch)`.

- Read your property's current value from `rawData` (e.g. `rawData.__blur`).
- Return a flat object of CSS properties (e.g. `{ filter: 'blur(2px)' }`).
- Return `{}` when your property is absent from `rawData`.
- Filter-family plugins return a key suffixed with `_filter` (e.g. `__blur_filter: 'blur(2px)'`). The engine collects all `*_filter` contributions and joins them into a single `filter` string to avoid collisions.

---

## Optional Fields

### `load(): Promise<void>` *(lazy plugins only)*

An async loader called once by the builder before the first `contribute()`. Only required when `lazy: true`.

---

## Calling Sites

| Location | How `claimsKey` is used |
|---|---|
| [`plugins.js` — `resolvePluginForKey`](file:///d:/dev/motionpath/src/lib/plugins.js) | `ALL_PLUGINS.find(p => p.claimsKey(key))` — finds the right plugin for a schema keyframe property at build time. |
| [`engineCore.js` — `compose()`](file:///d:/dev/motionpath/src/lib/engineCore.js) | `Object.keys(source).some(key => p.claimsKey(key))` — detects whether a fallback plugin should be added to the composition pipeline for runtime data keys not declared in the schema. |

---

## Checklist for Adding a New Plugin

- [ ] Define `keys[]` with the public schema key(s).
- [ ] Set `lazy: false` (or `true` + implement `load()`).
- [ ] Implement `claimsKey(key)` — covers both public and private proxy keys.
- [ ] Implement `getNaturalValue(key, domNode)` — returns the DOM baseline.
- [ ] Implement `contribute(key, stops, element?)` — returns `{ percentPatch, tweenVars }`.
- [ ] Implement `compose(rawData)` — returns a CSS-ready patch object.
- [ ] Register the plugin in `ALL_PLUGINS` in [`plugins.js`](file:///d:/dev/motionpath/src/lib/plugins.js).
