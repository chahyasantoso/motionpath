# MotionPath v4 — Senior Architect Review

**Scope:** full read of branch `v4` — `domain/`, `usecases/`, `lib/`, `engines/`, `renderers/`, `validators/`, `hooks/`, plus the Spiral demo as a representative consumer.
**Verdict:** the _bones are genuinely good_. The seams are in the right places, the hard concurrency problem (cycle-safe cross-track composition) is solved correctly, and the comment quality in the tricky files is better than most production codebases. What's wrong is almost entirely **integration and truth-source discipline**, not design taste. There are 4 defects that will bite in production, and one structural gap that is quietly pushing complexity into every consumer.

---

## Part 1 — What is genuinely well designed

Worth naming explicitly, because the fixes below should not disturb any of it.

1. **`Track.compose()`'s per-call `ctx` Map.** A fresh scope per external call, a `COMPOSING` sentinel that collapses cycle back-edges to the local plugin-only patch, and a resolved-entry memo that makes diamonds O(1). This is the correct solution to arbitrary-graph FK evaluation, it never persists state across frames, and the reasoning is documented inline. Do not touch this.
2. **`contribute` / `compose` split.** Separating "compile the authored stops once" from "resolve a frame" is exactly the right decomposition, and it is what makes the 60fps path allocation-light.
3. **Animating `Track.progress()` as a GSAP function-property.** Two-level clock hierarchy with zero custom scheduler. Elegant, and it means every GSAP feature (repeat, yoyo, ScrollTrigger, timeScale) composes for free.
4. **Delegate seams.** `TriggerDelegate` and `LayoutDelegate` are the two genuinely correct extension points, with `registerTriggerDelegate()` and per-track `layoutDelegate` injection. `LayoutDelegate` returning _numbers only_, never touching a timeline, is a disciplined boundary.
5. **`GaplessLayoutDelegate`'s reasoning.** Anchoring spawn offset to the real frontmost sibling instead of a counter; sorting reflow by settled `currentOffset` rather than live timeline position; refusing to cascade rank-0 removals to avoid an avalanche of instant completions. Every one of those is a scar from a real bug and the comments say so.
6. **Fail-fast at build time.** Ease collisions and `tweenVars` collisions throw during `buildTrackTween` rather than producing mystery motion at runtime.
7. **`Motion.mount()` pre-`init` buffering.** `#initialTracks` makes mount order irrelevant, so callers can't get it wrong.
8. **`useMotionSubscribers` live-ref pattern.** Mirroring `transformFn` and `anchor` in refs while keying resubscription off a source _signature_ is the right way to keep an animated anchor from being frozen. Deliberate and correct.

---

## Part 2 — Findings

Severity: **P0** = will cause production incidents · **P1** = structural, compounding cost · **P2** = quality and performance.

### P0 — Correctness and silent failure

**R-01 · The validator is not connected to anything.**
`validateProject()` in `validators/index.js` orchestrates 12 rules and has ~30 tests. **Nothing in the runtime calls it.** `Engine.loadProject()` calls `parseV4Project()` only. Every constraint the team carefully encoded — scrub incompatibilities, stop shapes, duplicate ids, template references — is enforced in tests and nowhere else. Malformed schemas fail later as a GSAP warning or a silent no-op.
_Fix:_ call it as the first step of `loadProject`, throw an aggregate error on `severity: 'error'`, and add a `{ validate: false }` opt-out for hot paths. Also extend the per-track rules to walk `schema.tracks[]` — today only `motion-structure` sees standalone tracks, so a stamping-only project is effectively unvalidated. **~30 lines. Highest value change in the repo.**

**R-02 · `id` vs `motionId` accepted by the validator, rejected by the runtime.**
`motion-structure.js` computes `effectiveId = id ?? motionId`. `parseV4Project` and `Engine` read only `.id`. A schema using `motionId` **passes validation**, then registers under key `undefined`, then `mountInstance` throws "not found". Made worse by `domain/types.js`, which documents the field as `motionId`.
_Fix:_ pick `id`. Treat `motionId` as a forbidden v3 field with its own error message, exactly like `driver` and `timelineId` already are.

**R-03 · `TimeTriggerDelegate` silently drops `duration`, `delay`, and `autoplay`.**
`build()` reads only `repeat`, `yoyo`, `repeatDelay`. But `types.js` declares all three of the others, and `spiralMotions.js` ships `trigger: { type: 'time', autoplay: false, duration: 0.35 }` — so **that motion autoplays regardless**, and the demo only appears to work because the controller drives those tracks by hand. Every time motion is unconditionally autoplaying.
_Fix:_ honor `paused: !(autoplay ?? true)` and `delay` in `build()`. For `duration`, either apply it as a master `timeScale` or make the validator reject it on time triggers. Silently ignoring an authored field is the worst of the three options.

**R-04 · `Engine.#instances` never prunes; stamped tracks are never adopted.**
`mountInstance`/`mountWithDelegate` add to `#instances`; nothing removes. Hooks call `inst.destroy()` on unmount but the map keeps the corpse, so `engine.destroy()` later double-destroys, and the map grows monotonically across route changes. Separately, tracks built via `createTrack()` for stamping (30+ per Spiral wave) are **never registered at all**, so `engine.destroy()` cannot clean them. The key space is also mixed: motions key on the synthetic `motion-N`, tracks key on `track.id`.
_Fix:_ add `engine.unmount(instance)` and call it from every hook cleanup. Unify the key space. Add `engine.adopt(track)` (or an Engine-owned track factory) so stamped tracks are reachable.

**R-05 · Circular import between `Track.js` and `helpers.js`.**
`Track.js` imports `eventBus` from `helpers.js`; `helpers.js` imports `mergePatches` from `Track.js`. It survives today only because of ESM hoisting order. It is one refactor away from a TDZ crash. `helpers.js` also imports `renderers/domRenderer.js`, an inner layer depending on an outer one.
_Fix:_ move `mergePatches` to `usecases/ComposeTrackPatch.js` (where it belongs), move `eventBus` to `lib/eventBus.js`, and move `switchToTrack` out of `lib/` into the hooks layer since it is DOM-aware.

### P1 — Structural

**R-06 · Plugin compose order is decided by JSON key order.**
The most dangerous design gap. `resolvedPlugins` is ordered by `Object.keys(keyframes)`, and `composeTrackPatch` merges **last-wins**. Three plugins emit overlapping keys: `path` → `x,y,z,xPercent,yPercent,rotation`; `boneLength` → `x,y,rotation`; simple keys → the same. So `{ x, path }` and `{ path, x }` produce **different animations from identical data**. There is no priority concept anywhere.
_Fix:_ add an explicit `stage` or numeric `priority` to the plugin contract (`base` → `transform` → `override`), sort `resolvedPlugins` by it in `buildTrackTween`, and make an unresolved same-stage key collision a **build-time error** rather than a silent overwrite. This is a ~40-line change that removes a whole class of unreproducible bugs.

**R-07 · `pathPlugin` hardcodes `xPercent: -50, yPercent: -50`.**
A rendering/centering _policy_ baked into a domain plugin, which silently clobbers any authored `xPercent`/`yPercent` (themselves legal simple keys). Every consumer that does not want center-anchored path motion has to fight it via `applyAnchor`.
_Fix:_ `path.anchor: 'center' | 'none' | { x, y }`, defaulting to `'center'` for compatibility.

**R-08 · `filter` is special-cased in three separate files.**
`composeTrackPatch`, `Track.mergePatches`, and `domRenderer.serializeFilter` all hardcode `k === 'filter'`, and the suffix map covers exactly four functions — `hue-rotate`, `grayscale`, `drop-shadow` would be silently dropped. This is the framework leaking one plugin's data shape into three layers.
_Fix:_ let plugins declare output metadata: `outputs: { filter: { merge: 'shallow', serialize: fn } }`. The merger asks the plugin; the renderer asks the plugin. Then `filter` is just the first user of a general mechanism.

**R-09 · `domRenderer` hardcodes a denylist of another module's internals.**
`delete domPatch.pathProgress; delete domPatch.cubicPath; delete domPatch.autoRotate;` — the renderer knows `pathPlugin`'s private field names. Adding any plugin with intermediate proxy state requires editing the renderer, which breaks the "add a plugin, touch nothing else" promise.
_Fix:_ namespace internals by convention (`_pathProgress`) and strip by prefix, or have plugins declare `internalKeys`. Either removes the coupling permanently.

**R-10 · `TriggerDelegate` has no enforced contract, and `ManualTriggerDelegate` implements a different interface.**
Scroll and Time expose `build/play/pause/seek/reverse/onComplete/destroy`. Manual exposes `build/progress/destroy`. Consequences: `Motion.play()` → `this.trigger?.play?.()` **silently no-ops** on manual motions, and `useManualMotion`'s `seek()` → `instance.trigger.progress(p)` **silently no-ops** on scroll/time motions. Both are optional-chained into oblivion. Scroll and Time also duplicate five identical passthrough methods each, even though `AutonomousTimelineControls` already exists to hold them.
_Fix:_ one base class (mirroring `LayoutDelegate`'s style) with `seek(progress)` as the single playhead verb; have Scroll/Time/Manual all extend it and inherit the passthroughs; make missing methods throw instead of no-op.

**R-11 · `Motion` leaks its delegate to application code.**
`motion.trigger` is public, so consumers write `containerInstance.trigger.seek(0)` and `instance.trigger.progress(p)`. App code is now coupled to which delegate class was constructed — which is exactly what R-10's asymmetry punishes.
_Fix:_ make `trigger` private and expose `Motion.play/pause/seek/reverse/onComplete`. Two-line facade, removes a whole coupling axis.

**R-12 · Plugins are the only extension point that is closed.**
`ALL_PLUGINS` is a hardcoded `const` array with no `registerPlugin()`, while triggers get a mutable registry and layout gets constructor injection. Third parties must fork. `resolvePluginForKey` is also a linear `.find` over ~35 plugins, called per key at build time and inside parse.
_Fix:_ a `Map` index for exact keys plus a small ordered list for predicate plugins (`--*`, `path` aliases), and `registerPlugin`/`unregisterPlugin` to match the trigger registry's ergonomics.

**R-13 · The missing layer: there is no orchestration primitive, so orchestration lives in React hooks.**
This is the finding with the largest long-term cost. `useSpiralWaveController.js` is ~200 lines of application code doing all of: its own `requestAnimationFrame` loop **competing with the GSAP ticker**; per-frame `lastTrack.progress()` polling to decide spawn timing; manual `createTrack` stamping from `engine.getTrackConfig`; manual `setObserved`/`removeObserved` wiring with hand-rolled race guards ("a fast click during entrance may have already started the exit"); direct `gsap.to(exitTrack, { progress: 1 })` that **bypasses Motion and the master timeline entirely**; and `console.log` in the spawn/remove hot path. Every future consumer that spawns entities will reinvent all of it, differently, with different race bugs.
_Fix:_ promote two primitives into `usecases/`:

- **`Spawner`** — declarative spawn policy (`{ interval | progressGate, maxAlive, waveSize, onWaveComplete }`) driven by the **GSAP ticker**, not a competing RAF loop.
- **`Overlay`** — owns the observe/animate/unobserve/destroy lifecycle as one unit: `track.overlay(config, { duration }) → Promise`, with hard-replace semantics so the entrance/exit race is solved once, in a tested place.
  That pulls ~150 lines out of every consumer and turns the trickiest correctness problem in the system into library code.

**R-14 · `Motion.init()`'s `addLabel('end', 1)` does not do what its comment claims.**
The comment says it "forces the master timeline to span exactly [0,1] so progress-fraction stagger offsets map to timeline percentages." GSAP labels do not affect timeline duration. In practice `stagger` is already in **seconds** (Spiral passes `spawnIntervalMs / 1000`) and the master's duration is derived from its children, so the label is a no-op carried over from v3.
_Fix:_ delete the label and the comment, and document in the schema that `stagger` is seconds. A misleading comment on the clock hierarchy is worse than no comment.

### P2 — Quality and performance

**R-15 · No per-frame write coalescing.** `useMotionSubscribers`' docstring says "one DOM write per tick," but `applyMerged()` runs inside _each_ source's callback — N sources means N `gsap.set` calls per frame. _Fix:_ buffer patches and flush once on `gsap.ticker` after all sources report.

**R-16 · No dirty-checking.** Every tick writes every property even when unchanged, and `imageSequence` allocates a fresh `url(...)` string per frame even while sitting on the same frame index. _Fix:_ shallow-diff the patch against the last applied one in `domRenderer`; skip identical values.

**R-17 · Percent keys are raw float math.** `` `${stop.p * 100}%` `` turns `p: 0.29` into `"28.999999999999996%"`. Two stops the author considers identical can produce different keys, which **dodges the ease-collision check**. The same line is duplicated in six plugins. _Fix:_ one shared `toPercentKey(p)` that rounds to fixed precision; use it everywhere.

**R-18 · `contribute()` performs network I/O.** `imageSequenceProperty` calls `warmFrames()` — constructing `Image` objects and firing requests — inside a pure compile hook, unawaited, while declaring `lazy: false`. The `lazy`/`load()` mechanism exists for exactly this. _Fix:_ move preloading into `load()` (or a new `prepare(trackConfig)` phase) so `parseV4Project` awaits it and the first frames don't pop.

**R-19 · `domain/types.js` is fiction.** It declares `MotionProject` with Maps, `MotionDefinition.driver` (a v3 field the validator _forbids_), `motionId`, `Plugin.contribute(Object, string, string)` and `Plugin.compose(Object, Object, Object, string)`. Reality: motions have `trigger`, ids are `id`, and the signatures are `contribute(propKey, stops, trackConfig)` / `compose(rawData, trackConfig)`. An AI agent or new hire reading this file will write code that cannot run. _Fix:_ regenerate from reality — or better, ship real `.d.ts` for the schema and plugin contract so drift becomes a build error. The repo's own wishlist already lists TypeScript migration; this is the argument for prioritizing it.

**R-20 · `README.md` documents v3.** `ProductionEngine`, `EditorEngine`, `builder.js`, `compileProject.js`, `useMotionTrigger`, `scenarios`/`elements`, `initialPlayStates`, `options.playStates` — none exist on v4. It is also the file an onboarding agent will read first, and it contains an explicit "AI & Developer Cheat Sheet" that is now actively misleading. _Fix:_ replace it. (The two companion documents in this set are drop-in replacements.)

**R-21 · Dead code.** `engines/engineCore.js` (imports and JSDoc-references a `domain/MotionInstance.js` that does not exist; nothing imports `createEngineCore`), the v3 `MotionInstance` branch inside `useMotionSubscribers.subscribeToSource`, and the `buildTrackTweenSync` / `composePatch` migration aliases. _Fix:_ delete. Dead compatibility shims for a version that no longer exists are pure onboarding tax.

**R-22 · `SUPPORTED_SCHEMA_VERSIONS = [2, 3, 4]` is a lie.** `motion-structure` hard-rejects every v2/v3 field, so a v2 or v3 schema cannot pass validation. _Fix:_ `[4]`, or write real migrators. Advertising support you don't have is worse than a clean rejection.

**R-23 · Global mutable singletons.** `engine`, `eventBus`, `triggerDelegateRegistry`, and the plugin `loadPromises` map are all module-level. Two projects on one page share state, and tests need `_resetLoadPromises()` / `_resetPreloadCache()` escape hatches — the tell. `eventBus` has no namespacing, so `child:spawned` is global and consumers filter by `parentId` by hand. _Fix:_ keep the singleton as a convenience export but make `Engine` independently constructible with its own bus; better, emit child events on the parent `Track` so no filtering is needed.

**R-24 · Stop sequences are under-validated.** Not checked: monotonic `p`, presence of `p: 0` / `p: 1`, duplicate `p`. The proxy is seeded **only** from the merged `0%` frame, so a property with no `p: 0` stop starts `undefined` — a silent first-frame glitch. _Fix:_ add a `stop-sequence` rule for monotonicity and duplicates, and warn on a missing `p: 0`.

**R-25 · Swallowed errors and hot-path logging.** `catch (e) { /* ignore */ }` in `Motion.destroy` and `Track.destroy` hides real teardown failures; `console.log` fires per spawn and per removal in the Spiral controller. _Fix:_ a dev-gated logger, and at minimum log swallowed teardown errors.

**R-26 · 198 tests, zero integration tests.** Coverage is good per unit, but there is **no test that loads a project through `Engine → Motion → Track → domRenderer`**. Findings R-01, R-02, R-03, R-04 and R-06 would _all_ have been caught by one such test. _Fix:_ 3–4 end-to-end tests with jsdom and a fake ticker: load → mount → advance N frames → assert the styles actually written. Highest bug-per-test-line ratio available.

---

## Part 3 — The one-sentence diagnosis

**Schema truth is scattered across four places, three of which are wrong, and none of which is executable at runtime.**

| Source                                     | Status                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `README.md` prose                          | Describes v3. Wrong.                                                        |
| `domain/types.js` JSDoc                    | v3/v4 hybrid. Wrong.                                                        |
| `validators/rules/*`                       | Correct — and never executed in production.                                 |
| The runtime parser's implicit expectations | Correct, undocumented, and disagrees with the validator on `id`/`motionId`. |

Every P0 finding except R-05 is a direct consequence of that fragmentation. **Collapse it: make the validator the executable spec, wire it into `loadProject`, generate types from it, delete the prose duplicates.** Nothing else on this list pays back as fast.

The secondary diagnosis: **there are five layers but no orchestration layer**, so orchestration leaked into React hooks (R-13). Naming that layer — `Spawner`, `Overlay`, and a `MotionController` facade over `Motion` — is what turns v4 from a very good engine into a reusable one.

---

## Part 4 — Suggested sequence

**Phase 1 — Stop the bleeding (~1 day, no API change)**
R-01 wire the validator · R-02 kill `motionId` · R-03 honor `autoplay`/`delay` · R-04 prune instances · R-05 break the import cycle · R-21 delete dead code · R-26 add 4 integration tests.

**Phase 2 — Make behavior predictable (~2–3 days, minor API additions)**
R-06 plugin priority/stage · R-17 shared `toPercentKey` · R-10 unified delegate contract · R-11 `Motion` facade · R-14 delete the misleading label · R-24 stop-sequence rule.

**Phase 3 — Close the abstractions (~1 week)**
R-08 declared output-merge metadata · R-09 internal-key convention · R-12 plugin registry · R-07 `path.anchor` · R-18 preload in `load()`.

**Phase 4 — Name the missing layer (~1–2 weeks)**
R-13 `Spawner` + `Overlay` primitives, then refactor the Spiral and TowerDefense controllers onto them. Those two demos are the acceptance test: if they don't each shrink by >100 lines, the primitives are wrong.

**Phase 5 — Lock it in**
R-19 `.d.ts` (or full TS) generated from the validator · R-20 replace the README · R-22 drop fake version support · R-23 de-singleton the Engine.

Then the README's own wishlist items — velocity-based `timeScale`, the Engine/Player split, stagger overlaps — become small, because Phases 2–4 build exactly the seams they need.
