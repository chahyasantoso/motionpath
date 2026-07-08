# Image Sequence Plugin Implementation Plan

## Scope

Implement only the `imageSequence` plugin for the MotionPath engine. Keep the design aligned with the existing plugin contract: `contribute()` prepares tweenable proxy fields, `compose()` converts proxy state into a DOM-ready patch, and the engine continues to apply the merged patch through the existing `gsap.set(domNode, composedPatch)` flow. This matches the engine model where plugins operate against a plain proxy object and `compose(elementId, data)` is the public step that turns proxy data into DOM output.[file:1]

The plugin should use the native unit directly: frame index. Do **not** add a normalized progress layer. In this schema family, `path` is the exception because it needs a synthetic `pathProgress` value, while normal properties already use real values in `stops[].v`; `imageSequence` should follow that simpler pattern.[file:1]

## Chosen output

Use `backgroundImage` as the composed output. This keeps the plugin tag-agnostic, which is consistent with the rest of the system where element `id` resolves to any DOM node via `data-motion-id` and no property currently depends on a specific HTML tag.[file:1]

Do not implement `<img>.src` writing in v1. That would introduce a silent failure class on non-`<img>` targets, while the current validation boundary is intentionally schema-only for static checks and runtime-only for live DOM resolution, not tag-aware schema validation.[file:1]

## Schema shape

Add `imageSequence` as a new keyframe property under `element.keyframes`, alongside other flat property keys. The shape should be:

```json
{
  "imageSequence": {
    "frames": ["/img/001.jpg", "/img/002.jpg", "..."],
    "stops": [
      { "p": 0, "v": 0 },
      { "p": 1, "v": 300 }
    ]
  }
}
```

This follows the existing schema pattern where animated properties live inside `keyframes`, and each animated property must declare at least two stops using `p`, `v`, and optional `ease`.[file:1]

## Data model

Treat `stops[].v` as the frame index directly, not normalized progress. During tweening, allow fractional values on the proxy object so easing remains smooth; round only inside `compose()` when selecting the concrete frame URL.

Use one synthetic proxy field name internally, such as `imageSequenceIndex`, for clarity and collision avoidance. This mirrors the existing engine pattern where synthetic fields like filter sub-values and `pathProgress` live on the proxy, then `compose()` emits the final DOM-ready property patch.[file:1]

## Validation

Add only minimal schema validation rules:

- `imageSequence.frames` is required.
- `imageSequence.frames` must be an array of strings.
- `imageSequence.frames.length` must be at least 1.
- `imageSequence.stops` is required.
- `imageSequence.stops.length` must be at least 2.
- `stops[].p` follows the standard progress rules already used by other properties.
- `stops[].v` must be numeric.

Do **not** add DOM-aware validation. The current architecture already separates static schema validation from runtime DOM resolution, and nothing in v1 requires tag-type checks for a property.[file:1]

Do **not** add mutual exclusivity rules against `x`, `y`, `opacity`, or `path`. Unlike `path`, this plugin does not compute position or rotation, so there is no property conflict to guard against.[file:1]

## Plugin contract

Implement the plugin with the same responsibilities as existing plugins.

### `contribute()`

Responsibilities:

- Read `elementCfg.keyframes.imageSequence`.
- Register the tween contribution so `stops` drive the proxy field `imageSequenceIndex`.
- Trigger non-blocking preload warmup for the frame list.
- Return the same tween-shape metadata the engine already expects from other properties.

Suggested behavior:

```ts
contribute(ctx) {
  const cfg = ctx.elementCfg.keyframes.imageSequence;
  if (!cfg) return null;

  warmFrames(cfg.frames);

  return {
    prop: 'imageSequenceIndex',
    stops: cfg.stops
  };
}
```

Keep this function eager and synchronous. It should not change the engine loader contract, should not await asset loading, and should not introduce per-element async branching.

### `compose()`

Responsibilities:

- Read `data.imageSequenceIndex`.
- Round to the nearest whole frame.
- Clamp to the valid frame range.
- Return `{ backgroundImage: `url(...)` }`.

Suggested behavior:

```ts
compose(data, elementCfg) {
  const cfg = elementCfg.keyframes.imageSequence;
  if (!cfg) return null;

  const frames = cfg.frames;
  const rawIndex = data.imageSequenceIndex;
  const idx = Math.max(0, Math.min(frames.length - 1, Math.round(rawIndex)));

  return {
    backgroundImage: `url(${frames[idx]})`
  };
}
```

The clamp is defensive and avoids `url(undefined)` if authored values drift outside the available frame range.

## Preload design

Implement preload as fire-and-forget, entirely inside the plugin module. Keep cache ownership in the plugin, not the engine. This follows the same general architectural discipline already used elsewhere: plugin-specific state stays with the plugin, while the engine stays focused on orchestration and composition boundaries.[file:1]

Recommended module-level structure:

```ts
const imageSequenceWarmCache = new Map<string, Promise<void>>();
```

Cache key recommendation:

- Prefer a deterministic key derived from the frame list contents, for example `frames.join('
')`.
- Do not key by element id, because multiple elements may reuse the same frame list.

Suggested warmup helper:

```ts
function warmFrames(frames: string[]): Promise<void> {
  const key = frames.join('
');
  if (imageSequenceWarmCache.has(key)) {
    return imageSequenceWarmCache.get(key)!;
  }

  const promise = Promise.all(
    frames.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  ).then(() => undefined);

  imageSequenceWarmCache.set(key, promise);
  return promise;
}
```

Important behavior:

- Never block build or first render on preload completion.
- Treat preload as a best-effort optimization only.
- Resolve on both success and error so the cache cannot deadlock on one bad asset.
- Do not expose preload state to the engine in v1.

## Engine touch points

The engine changes should stay small.

1. Register the new plugin in the plugin registry beside other core/eager plugins.
2. Ensure the property walker recognizes `keyframes.imageSequence` and passes it through the existing plugin contribution flow.
3. Ensure `compose(elementId, data)` merges the plugin's `backgroundImage` patch the same way it already merges other plugin outputs and filter/path compositions.[file:1]

No new engine capability is needed beyond plugin registration. The architecture already supports a plain proxy object during tweening and a later `compose()` step that emits DOM-ready patches.[file:1]

## Types

Add explicit types so implementation stays maintainable.

```ts
type ImageSequenceStop = {
  p: number;
  v: number;
  ease?: string;
};

type ImageSequenceConfig = {
  frames: string[];
  stops: ImageSequenceStop[];
};
```

If there is a central union of keyframe-property configs, add `imageSequence?: ImageSequenceConfig` there. If there is a proxy-data type, add `imageSequenceIndex?: number` there.

## Tests

Keep tests small and behavior-focused.

### Validation tests

- Accepts valid `frames` array plus 2-stop config.
- Rejects missing `frames`.
- Rejects empty `frames`.
- Rejects non-string frame entries.
- Rejects missing or single-stop `stops`.
- Rejects non-numeric `stops[].v`.

### Compose tests

- `0` selects first frame.
- Last exact index selects last frame.
- Fractional value rounds to nearest frame.
- Negative value clamps to first frame.
- Overshoot value clamps to last frame.
- Missing plugin config returns `null` or no patch, matching existing plugin convention.

### Preload tests

- Repeated warmup with same frame list reuses one cache entry.
- Different frame lists create different cache entries.
- Image load error still resolves the cache promise.

### Integration tests

- Engine applies `backgroundImage` patch from imageSequence through normal compose/set flow.
- `imageSequence` can coexist with `x`, `y`, `opacity`, and filters on the same element without conflicts.

## Delivery order

Implement in this order to reduce risk:

1. Add schema/types for `imageSequence`.
2. Add validator rules.
3. Implement plugin `contribute()` and `compose()` without preload.
4. Add unit tests for compose and validation.
5. Add fire-and-forget preload cache.
6. Add preload tests.
7. Add one integration test through the normal engine flow.

This order keeps the first shippable version simple, then adds preload as a non-functional optimization.

## Deferred wishlist

Defer the preload wishlist from the initial implementation. v1 should keep preload best-effort and plugin-local, with no engine contract expansion.

Document these as explicit follow-ups, not current scope:

- Preload concurrency limit, to avoid spawning too many simultaneous image requests on very large sequences.
- Progressive warmup, for example first frame immediately, nearby frames next, full sequence later.
- Visibility-aware warmup, so offscreen scenes do not eagerly request every frame.
- Idle-time scheduling via `requestIdleCallback` fallback strategy.
- Optional author hint such as `preload: 'eager' | 'visible' | 'off'` if a real product need appears.
- Cache eviction strategy for very large projects or SPA route churn.
- Decode-aware warmup using `img.decode()` where beneficial.
- Responsive frame sets or density variants, only if the schema later introduces a real responsive asset story.

Do not build any of the above now. None are required for the core plugin contract, and each one adds policy surface area that the current engine intentionally avoids.[file:1]

## Handoff notes for Gemini

Implementation should prefer the smallest change set that fits the existing architecture. Do not introduce a new normalized-progress abstraction, a new engine async lifecycle, or tag-aware validation.

Success criteria:

- `imageSequence.stops[].v` maps directly to frame index.
- Plugin output is `backgroundImage`.
- Preload is optional, fire-and-forget, plugin-local, and cached by frame-list contents.
- Engine changes are limited to registration and normal plugin flow integration.
- Tests cover validation, compose behavior, preload cache reuse, and one integration path.
