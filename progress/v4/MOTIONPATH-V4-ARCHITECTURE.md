# MotionPath v4 — Architecture & Onboarding Guide

**Audience:** a new human engineer or an AI agent that must read, extend, or debug this system with no prior context.
**Read this with:** `MOTIONPATH-V4-SCHEMA.md` (data contract) and `MOTIONPATH-V4-ARCHITECT-REVIEW.md` (known defects).

> ⚠️ **Do not onboard from `README.md`.** It documents the **v3** system (`ProductionEngine.js`, `EditorEngine.js`, `builder.js`, `compileProject.js`, `useMotionTrigger`, `scenarios`/`elements`, `initialPlayStates`). None of those exist on branch `v4`. `src/domain/types.js` is also partly stale. This guide was derived from the v4 source.

---

## 1. What this system is, in one paragraph

MotionPath is a **data-first animation runtime** on top of GSAP. Animations are declared as JSON, compiled once into GSAP tweens over **plain proxy objects** (never DOM nodes), and broadcast per frame to subscribers that write styles directly to the DOM via `gsap.set`. React is used only to mount, unmount, and toggle high-level state — it never re-renders at 60fps. The core insight: **the animation graph and the render target are fully decoupled**, so the same compiled project can drive DOM, canvas, or a headless test.

**Two non-negotiable invariants:**

1. **Zero re-render.** Nothing in the frame loop touches React state. A `setState` inside a subscriber callback is a bug.
2. **The domain never knows about the DOM.** `Track`, `Motion`, plugins, and use cases deal in plain objects. Only `renderers/domRenderer.js` touches an element.

---

## 2. Layer map

```
src/
├── domain/          ← pure rules, zero I/O, zero framework
│   ├── types.js             JSDoc typedefs (STALE — see review R-19)
│   ├── createAnimationPlugin.js   plugin factory: {keys, lazy, claimsKey, contribute, compose}
│   ├── plugins.js           registry: ALL_PLUGINS, resolvePluginForKey, ensureLoaded
│   └── plugins/             simpleProperty, colorProperty, filterProperty, pathPlugin,
│                            cssVarProperty, imageSequenceProperty, fkPlugin
│
├── usecases/        ← stateless pure functions, the compiler
│   ├── ResolveTrack.js      track + template -> resolved config
│   ├── BuildTrackTween.js   resolved keyframes -> {proxy, tween, resolvedPlugins}
│   └── ComposeTrackPatch.js proxy snapshot -> merged style patch
│
├── lib/             ← stateful runtime entities
│   ├── Motion.js            Motion + TrackGroup (owns the master timeline)
│   ├── Track.js             the core entity: playhead, compose, subscribers, children, observation
│   ├── createTrack.js       factory: resolve -> build -> new Track
│   ├── TriggerDelegate.js   Scroll/Time/Manual delegates + triggerDelegateRegistry
│   ├── LayoutDelegate.js    child-placement contract
│   ├── GaplessLayoutDelegate.js / StaticLayoutDelegate.js
│   ├── helpers.js           eventBus, applyAnchor, autoPlay, playOnEvent, switchToTrack
│   ├── fkMath.js            composeWorld (FK)
│   └── schema/parseV4Project.js   JSON -> config maps + awaits lazy plugins
│
├── engines/         ← orchestration entry point
│   ├── Engine.js            loadProject / mountInstance / mountWithDelegate / destroy + `engine` singleton
│   └── engineCore.js        DEAD CODE (references a non-existent domain/MotionInstance.js)
│
├── renderers/       ← the only DOM-aware module
│   └── domRenderer.js       patch -> gsap.set, serializes filter, strips internal keys
│
├── validators/      ← executable spec, 12 rules, collect-all, never throws
│   ├── index.js             validateProject()  ⚠️ NOT wired into the load path
│   └── rules/*.js
│
├── hooks/           ← React bindings
├── utils/           ← pathUtils, pathMath, projection3d, deferredCall
└── components/      ← 9 demo pages (Spiral, PasarMalam, TowerDefense, Burst, ...)
```

**Dependency direction is mostly clean:** `components -> hooks -> engines -> lib -> usecases -> domain`, with `renderers` as a sibling leaf. Two violations exist: `lib/helpers.js` imports `renderers/domRenderer.js` (inward-pointing dependency on an outer layer) and `Track.js <-> helpers.js` is a genuine import cycle. See review R-05.

---

## 3. The three core concepts

| Concept    | Owns                                                                                 | Analogy                        |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| **Motion** | one trigger, one GSAP master timeline, N mounted tracks                              | a scene / a timeline in an NLE |
| **Track**  | one playhead (0..1), one proxy object, its plugin set, its subscribers, its children | a layer / an animated entity   |
| **Plugin** | how one property key compiles (`contribute`) and how it renders (`compose`)          | a codec for one property       |

A **Track knows nothing about what it animates.** It produces a style patch. A subscriber decides where that patch lands.

---

## 4. Lifecycle: load → mount → tick → render

### 4.1 Load (async, once per project)

```
engine.loadProject(schema)
  └── parseV4Project(schema)
        ├── for each motion: assert trigger.type is in triggerDelegateRegistry
        ├── for each track: resolveTrack(track, templates) and collect the plugins its keys need
        ├── await ensureLoaded(plugin) for every lazy plugin  ← the only await in the pipeline
        └── returns { templates, motionConfigs: Map, trackConfigs: Map, getMotionConfig, getTrackConfig }
```

Nothing is instantiated yet. Load produces **configs**, not runtime objects. Both `motion.tracks[]` and top-level `schema.tracks[]` land in the same `trackConfigs` map, which is what makes runtime _stamping_ (§6.3) possible.

### 4.2 Mount (sync, per motion)

```
engine.mountInstance('cards-loop')
  ├── factory = triggerDelegateRegistry.get(trigger.type)
  ├── delegate = factory(motionConfig.trigger)
  ├── motion = new Motion({ id: 'motion-N', triggerDelegate, staggerTransition })
  ├── for each trackConfig, i:
  │     track = createTrack(config, templates)
  │       ├── resolveTrack()       merge template + overrides
  │       ├── buildTrackTween()    per key -> plugin.contribute() -> percentPatch + tweenVars,
  │       │                        detect ease/tweenVars collisions, seed proxy from merged 0% frame,
  │       │                        gsap.to(proxy, { keyframes, duration, paused: true })
  │       └── new Track({ id, interpolationTimeline: tween, proxyState: proxy, plugins, resolvedTrack })
  │     motion.mount(track, i * stagger)   ← buffered in #initialTracks, order-independent
  └── motion.init()
        ├── masterTimeline = delegate.build()      Scroll: gsap.timeline({scrollTrigger}) | Time: gsap.timeline({repeat,yoyo}) | Manual: gsap.timeline({paused:true})
        └── TrackGroup.mount(track, position) for each
              └── gsap.to(track, { progress: 1, ease: 'none', duration: track.duration })
                  added to masterTimeline at `position`
```

**The key trick:** `gsap.to(track, { progress: 1 })` animates the **`Track.progress()` method** as a GSAP function-style getter/setter. The master timeline drives `track.progress(p)`, which advances the track's own internal paused tween and notifies subscribers. That is the entire clock hierarchy — two levels, no custom scheduler.

### 4.3 Tick (per frame)

```
GSAP ticker -> masterTimeline -> child tween -> track.progress(p)
  ├── interpolationTimeline.progress(clamp01(p))   GSAP interpolates the proxy object
  └── #notify()
        └── for each subscriber: cb(getSnapshot())   snapshot = proxy fields + progress
              └── (hook) track.compose(raw)
                    ├── PRE-FOLD:  observed sources with role 'input'  -> merged into rawData
                    ├── PLUGINS:   composeTrackPatch(plugins, source, resolvedTrack)
                    │              each plugin.compose(rawData, trackConfig), merged last-wins
                    └── POST-FOLD: observed sources with role 'output' -> mergePatches over the result
              └── applyAnchor(patch, anchor)
              └── domRenderer(el, patch) -> strips pathProgress/cubicPath/autoRotate,
                                            serializes filter{}, then gsap.set(el, patch)
```

### 4.4 Destroy

`Motion.destroy()` → `TrackGroup.destroy()` kills every child tween and unmounts tracks → `delegate.destroy()` (ScrollTrigger is killed with `revert: true`). `Track.destroy()` clears subscribers, clears observations, kills its tween.

**Two leaks to know about:** `Engine.#instances` is never pruned on unmount, and tracks created directly with `createTrack()` (stamping) are never known to the Engine at all. See review R-04/R-14.

---

## 5. The plugin contract

A plugin is a plain object. No classes, no `this`.

```js
import { createAnimationPlugin } from "../createAnimationPlugin.js";

export const myPlugin = createAnimationPlugin({
  keys: ["wobble"], // keys this plugin owns
  lazy: false, // true => load() is awaited during parseV4Project
  claimsKey: (k) => k === "wobble" || k === "wobbleAmount", // optional; defaults to keys.includes

  // COMPILE TIME — once per track. Pure. Returns GSAP keyframe patches.
  contribute(propKey, stops, trackConfig) {
    const percentPatch = {};
    for (const s of stops) {
      percentPatch[`${s.p * 100}%`] = { wobbleAmount: Number(s.v) };
      if (s.ease) percentPatch[`${s.p * 100}%`].ease = s.ease;
    }
    return { percentPatch, tweenVars: {} };
  },

  // FRAME TIME — up to 60x/sec per track. Must be cheap and allocation-light.
  compose(rawData, trackConfig) {
    if (rawData.wobbleAmount === undefined) return {};
    return { rotation: Math.sin(rawData.progress * 20) * rawData.wobbleAmount };
  },
});
```

**`contribute` vs `compose` is the most important distinction in the codebase:**

|             | `contribute`                    | `compose`                   |
| ----------- | ------------------------------- | --------------------------- |
| When        | once, at `createTrack`          | every frame, per subscriber |
| Input       | authored `stops` + track config | interpolated proxy snapshot |
| Output      | GSAP `keyframes` + `tweenVars`  | style patch object          |
| Cost budget | free                            | ~microseconds               |

**To register a new plugin today you must edit `src/domain/plugins.js` and append to `ALL_PLUGINS`** — there is no `registerPlugin()`. If your plugin puts intermediate state on the proxy (like `path` does with `pathProgress`/`cubicPath`), you must **also** add those keys to the strip list in `renderers/domRenderer.js` or GSAP will warn. Both are known design gaps (review R-09/R-12).

---

## 6. Composition: the three ways tracks combine

This is the part of v4 that has no v3 equivalent and the part most likely to be misused.

### 6.1 Parent/child — "moving together"

```js
parentTrack.addChild(childTrack, { stagger: 0.35 });
parentTrack.getChild(id); // pure read, safe in render
parentTrack.childCount; // O(1)
parentTrack.removeChild(id);
```

The child is mounted onto the **host Motion's master timeline** at an offset chosen by the parent's **LayoutDelegate**. A track can have exactly one parent; `addChild` throws on a duplicate id or an already-parented child. Events `child:spawned` / `child:removing` fire on the global `eventBus`.

**LayoutDelegate** (`computeSpawnOffset(siblings, {stagger})` and `computeReflow(siblings, removedChild)`) is the pluggable placement policy. It returns numbers only — it never touches a timeline.

- **`GaplessLayoutDelegate`** (default): new children land at `frontmostOffset + stagger`, anchored to the real frontmost sibling rather than a counter (immune to both count-plateauing under churn and stale-counter gaps after a reflow). Removing a **mid-chain** child cascades every later sibling down one slot; removing the **frontmost** child (rank 0) deliberately does **not** cascade, because shifting survivors earlier can push them past completion and cause an avalanche of instant completions.
- **`StaticLayoutDelegate`**: fixed slots, no reflow.

Reflow motion is animated by the motion's `staggerTransition` — `TrackGroup._reflowChild` animates the child tween's own `startTime`, force-rendering the master each tick so the sibling visibly slides.

### 6.2 Observation — FK and cross-track influence

```js
// role 'output' (default): fold AFTER plugins, overrides this track's own fields
ballTrack.setObserved(exitOverlayTrack, (patch) => ({
  scale: patch.scale,
  opacity: patch.opacity,
}));

// role 'input': inject INTO rawData BEFORE plugins run (this is how FK gets parentWorld)
forearm.setObserved(upperArm, (world) => ({ parentWorld: world }), {
  role: "input",
});

ballTrack.removeObserved(t); // drop one
ballTrack.setObserved(null); // clear all
```

`compose()` reads `source.compose()` — the **fully resolved** patch, not a raw snapshot — so FK chains accumulate correctly through arbitrary depth. Cycles and diamonds are handled by a **per-call `ctx` Map** created fresh on every external `compose()` call: a `COMPOSING` sentinel short-circuits back-edges to the track's own plugin-only patch, and a resolved entry memoizes diamonds so a shared ancestor is computed once per frame. This is the single best-engineered piece of the codebase.

**There is no lifecycle coupling.** Track holds no reverse registry. **If you destroy an observed source you MUST `removeObserved(source)` first**, or the observer will keep calling `compose()` on a dead track. This is the #1 source of bugs in the demo code.

### 6.3 Stamping — one definition, N runtime instances

Declare a track under top-level `schema.tracks[]`, then clone it per instance:

```js
const cfg = engine.getTrackConfig("ball-track");
const track = createTrack(
  { ...cfg, id: `ball-${n}`, duration: 4 },
  engine.templates,
);
parentTrack.addChild(track, { stagger: 0.35 });
```

This is how the Spiral demo spawns 30 balls from one schema entry. **Caveat:** these tracks are invisible to the Engine and are not cleaned up by `engine.destroy()` — you own their `destroy()`.

---

## 7. React hooks

| Hook                                  | Signature                                       | Notes                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useMotionProject`                    | `(project) => isLoaded`                         | Loads once, `engine.destroy()` on unmount. **Gate all child mounts on `isLoaded`** — mounting early throws "project not loaded".                                                                                                                                                                                                                      |
| `useMotionInstance`                   | `(motionId, config) => Motion \| Track \| null` | `config` is mount-time only (dev warns if you change it). Pass `null` to defer.                                                                                                                                                                                                                                                                       |
| `useTimeMotion`                       | `(motionId, config) => { instance }`            | Thin wrapper; time motions need no refs.                                                                                                                                                                                                                                                                                                              |
| `useScrollMotion`                     | `(schema) => { refs, instance }`                | Takes the **schema object**, not an id. Builds its own `ScrollTriggerDelegate` from component-local refs, so N instances of one motion never collide. Attach `refs.trigger` / `refs.pin` / `refs.endTrigger`. `pin: 'pin'` in the schema means "use my separate pin ref". **The trigger element must exist in the same commit** or the effect no-ops. |
| `useManualMotion`                     | `(motionId, config) => { instance, seek }`      | `seek(p)` calls `delegate.progress(p)`. **Silently no-ops on non-manual motions.**                                                                                                                                                                                                                                                                    |
| `useMotionSubscriber`                 | `(instance, trackId, ref, transformFn?)`        | Single-source wrapper over the plural hook.                                                                                                                                                                                                                                                                                                           |
| `useMotionSubscribers`                | `(sources, ref, mergeFn?)`                      | The real implementation. `sources[] = { track \| (instance + trackId), transformFn?, anchor? }`. Resubscribes only when the source **signature** changes; `transformFn` and `anchor` are read live so an animated anchor is never frozen.                                                                                                             |
| `useMotionTimelinePlayback`           | `(timelineId, isPlaying)`                       | Play/pause from any depth.                                                                                                                                                                                                                                                                                                                            |
| `useDynamicHeight`, `useSmoothScroll` | —                                               | Layout/Lenis helpers.                                                                                                                                                                                                                                                                                                                                 |

### Rendering a track: the canonical pattern

```jsx
function Ball({ track, color }) {
  const ref = useRef(null);

  // Derive styles from progress WITHOUT React state.
  const transformFn = useCallback((raw, compose) => {
    const p = compose(raw); // run the plugin chain
    return { ...p, scale: 0.8 + raw.progress * 0.4 };
  }, []);

  useMotionSubscriber(null, null, ref, transformFn); // or: useMotionSubscribers([{ track, transformFn }], ref)
  return <div ref={ref} className="ball" style={{ background: color }} />;
}
```

**Hard rules for subscriber callbacks:**

1. Never call a state setter without a change-gate (`useRef` threshold). Unconditional `setState` per tick = React max-update-depth crash.
2. `useMotionSubscribers` bails if `ref.current` is null — you cannot register a "ghost" subscriber just to watch progress. Attach it to a real element.
3. Return a **new object**; do not mutate `rawData`.

---

## 8. Debugging playbook

| Symptom                                                | Most likely cause                                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `No plugin found for key "foo"`                        | Key not claimed by any plugin. Check spelling against the catalog; `--` vars and `path`/`boneLength` aliases are claimed by predicate, not by `keys`. |
| `mountInstance: motion or track "x" not found`         | Schema used `motionId` instead of `id`, or you mounted before `isLoaded`.                                                                             |
| `Ease collision on track ... at percent "50%"`         | Two properties put different eases at the same stop. One percent = one ease per track.                                                                |
| Element jumps to a corner / ignores its curve          | `path` and `x`/`y`/`xPercent` in the same track. Compose order decided by key order. Split into two tracks.                                           |
| Element is offset by half its size                     | `path` hardcodes `xPercent/yPercent: -50`. Expected, but not overridable.                                                                             |
| `autoplay: false` plays anyway                         | `TimeTriggerDelegate` ignores `autoplay`/`delay`/`duration`. Call `motion.pause()` after mount.                                                       |
| Stagger positions look wrong                           | `stagger` is in **seconds**, not progress fractions. The `addLabel('end', 1)` in `Motion.init()` does **not** normalize the timeline (review R-06).   |
| GSAP warns about an invalid property                   | A plugin put internal state on the proxy that `domRenderer` does not strip.                                                                           |
| Composed patch has stale values from a destroyed track | You destroyed an observed source without `removeObserved()` first.                                                                                    |
| Memory grows across route changes                      | `Engine.#instances` never prunes; stamped tracks are never adopted.                                                                                   |
| Nothing animates, no error                             | Validation never ran (it is not wired in). Call `validateProject(schema)` manually.                                                                   |

---

## 9. Extension points, ranked by how safe they are

1. **New property key** → add a plugin, append to `ALL_PLUGINS`. Safe, but check §5 for the `domRenderer` strip-list caveat.
2. **New trigger type** → `registerTriggerDelegate('gamepad', cfg => new MyDelegate(cfg))`. Implement `build()` returning a GSAP timeline, plus `play/pause/seek/reverse/onComplete/destroy`. Safe and properly designed.
3. **New child-placement policy** → subclass `LayoutDelegate`, pass via `config.layoutDelegate` on the track config. Safe. Stateless delegates may be shared; stateful ones must be per-parent.
4. **New render target** → write `canvasRenderer(target, patch)` mirroring `domRenderer`'s signature and swap it in the subscriber hook. The domain is already renderer-agnostic; only the hooks hardcode `domRenderer`.
5. **New validation rule** → add to `rules/`, register in the right array in `validators/index.js`. Free, but remember nothing calls the validator yet.

---

## 10. Glossary

- **proxy / proxyState** — the plain JS object GSAP actually animates. Seeded from the merged `0%` keyframe. Never a DOM node.
- **interpolationTimeline** — a track's own paused GSAP tween. Its `progress()` is driven by the master timeline.
- **master timeline** — the Motion's GSAP timeline, built by the trigger delegate. Owns all child track tweens.
- **patch** — a plain object of renderable style properties returned by `compose()`.
- **contribute** — compile-time plugin hook. **compose** — frame-time plugin hook.
- **fold** — merging an observed track's composed patch into this one; `role: 'input'` folds before plugins, `role: 'output'` after.
- **stamping** — cloning a `schema.tracks[]` config into N runtime tracks with unique ids.
- **reflow** — repositioning surviving siblings on the master timeline after a child is removed.
- **anchor** — a post-compose `{ xPercent, yPercent, offset:{x,y} }` adjustment applied by `applyAnchor`.
