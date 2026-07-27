# Feature Swarm — Multi-Instance Motion Support (v4 Design)

**Codename:** Swarm — many concurrent, independently-alive instances of one schema-declared motion.

**Status:** Design only, not yet implemented, not yet locked. Written for reference/discussion, not as an implementation brief.

---

## 1. Problem

`Engine.mountInstance(motionId)` currently treats `motionId` as both "which schema template to instantiate" AND "the unique identity of the live instance" — `#instances` is a `Map<motionId, Motion>`. Calling `mountInstance` twice with the same `motionId` destroys the first instance and replaces it with the second (confirmed live bug: TowerDefense's enemy spawning, where every enemy on a lane shares one `motionId`, so only one enemy per lane can ever be alive — each new spawn kills the previous one mid-flight).

v3 never had this problem: `MotionInstance` generates a globally unique id per instance (`inst-${counter}`), independent of `motionId`; `_instances` is keyed by that unique id; `mountInstance` never dedupes or destroys based on `motionId`. The "one instance per motionId" behavior demos like `CarouselDemo` rely on isn't an engine guarantee — it falls out of `useMotionInstance`'s `useEffect` running once per mount and cleaning up properly.

Restoring that alone (Part A below) fixes concurrent _manually-driven_ instances (TowerDefense-style, `Track` seeked directly by a game loop). But it does **not** by itself support concurrent _trigger-driven_ instances — e.g. the same scroll-scrubbed reveal animation repeated across N testimonial cards, each needing its own `ScrollTrigger` bound to its own DOM element. That needs Part B.

## 2. Goals

- Support N concurrent instances of one schema `motionId`, each fully independent (own `Track`s, own timeline, own lifecycle).
- Support this for all three trigger types — `manual`/`delegate`-style direct seeking (TowerDefense today), `time` (repeating bursts, toast queue), and `scroll` (repeated scroll-triggered sections).
- No change to the common case: a schema motion mounted exactly once (`CarouselDemo`, `HelixDemo`, `scrollScene`) should work identically to today, zero new configuration required.

## 3. Non-Goals

- Not solving the toast-queue's `EventBus`/`playOnEvent` trigger-type gap — that's a separate, already-flagged open item (event-driven trigger type, not scheduled). Swarm makes concurrent instances _possible_; it doesn't add a new trigger type.
- Not adding instance pooling/reuse across spawns — every `mountInstance` call still builds fresh, matching the existing "remount rebuilds fresh" principle, just no longer _destroying an unrelated concurrent instance_ to do it.
- Not changing `Track`-direct usage (the TowerDefense-without-Motion-at-all alternative discussed separately) — Swarm is for cases that specifically need trigger machinery per instance, not a replacement for going straight to `createTrack()` when no trigger is needed at all.

---

## Part A: Fix instance identity (prerequisite, needed regardless of Part B)

### Design

- `Motion` gains a genuinely unique instance id, separate from the schema id:
  - `motion.instanceId` — unique per call, e.g. `motion-${++counter}`, generated inside `Engine.mountInstance`.
  - `motion.motionId` — the schema id (`motionConfig.id`), kept as a plain property for reference/debugging, no longer used as a map key.
- `Engine.#instances` keyed by `instanceId`, not `motionId`.
- `mountInstance(motionId)` **always** creates a fresh instance. The current "destroy existing entry for this motionId before creating a new one" branch is removed entirely — it doesn't exist in v3 and is incompatible with concurrent instances by construction.
- `Engine.unmountInstance(motionId)` — currently dead code (grepped: zero callers anywhere in the codebase; every caller already holds the returned instance and calls `.destroy()` directly). Given multiple instances can now share a `motionId`, "unmount by motionId" is no longer a meaningful operation anyway — remove it rather than redesign it. No caller needs it.

### What doesn't change

- `useMotionInstance(motionId)` — unaffected. Its `useEffect` still runs once per mount, still gets back one instance, still cleans up correctly. Demos with exactly-one-instance-per-motionId behave identically.
- `Track.mount()`'s existing duplicate-track-id guard, `TrackGroup` internals, composition (`addChild`/`removeChild`) — untouched, orthogonal to instance identity.

---

## Part A′: Track-direct swarm (the case Part A/B do NOT cover)

### Why this is separate from Part A

Part A fixes swarming at the **`mountInstance` layer** — a full `Motion` with its own trigger delegate and master timeline per instance. But some swarms need no trigger and no per-instance timeline at all: they are **child tracks composed onto a parent's timeline** via `parentTrack.addChild(childTrack, { stagger })`. The Spiral demo is the canonical case — each ball is a bare `createTrack(...)` added as a child of the `spiral-container` keepalive track; overlays (entrance/exit) are bare tracks driven by a direct `gsap.to(track, { progress: 1 })`. No ball, and no overlay, ever touches `mountInstance` or a `TriggerDelegate`.

This is explicitly a Non-Goal of Part B (§3: "not a replacement for going straight to `createTrack()` when no trigger is needed"). So Part A's fix does not reach it: the collision Part A removes lives in `mountInstance`, which the Track-direct path never calls.

### The same root cause, one layer down

The Track-direct path today has the _identical_ schema-id-vs-instance-id confusion, but expressed differently. Because there is no engine registry keyed by id for child tracks, callers have historically dodged the collision by **re-typing the keyframes inline** with a per-instance id manufactured on the spot:

```js
// useSpiralWaveController.js, TODAY — three of these, keyframes duplicated
// byte-for-byte from spiralMotions.js's createSpiralBallScene / createSpiralTransitionScene:
const ballTrack = createTrack({
  id: `ball-track-${id}`,
  keyframes: { path: {...}, opacity: {...}, '--ball-size': {...} },  // ← duplicate of schema
  duration: BALL_TRAVEL_SECONDS,
});
parentTrack.addChild(ballTrack, { stagger });
```

The unique id (`ball-track-${id}`) IS the "stamp N copies" primitive — it's just being paid for with duplicated definitions, so the schema (`spiralMotions.js`) is no longer the runtime source of truth. `createSpiralBallScene` / `createSpiralTransitionScene` become **dead schema**: parsed at load, never read at runtime (confirmed — grep finds zero consumers of `spiral-zuma` / `ball-exit` outside the schema file itself).

### Design: stamp instances from the loaded config

`parseV4Project` already flattens **every motion's tracks** into `trackConfigsMap` (`ball-track`, `ball-exit-track`, `ball-entrance-track` are all in there after `loadProject`). The only gap is that `Engine` exposes mounted _instances_ (`getTrack`), never the parsed _configs_. Close that gap:

```js
// Engine.js — expose the loaded project's parsed configs (read-only)
getTrackConfig(id) { return this.#v4Project?.getTrackConfig(id) ?? null; }
get templates()   { return this.#v4Project?.templates ?? []; }
```

```js
// caller — definition comes from the loaded "file"; id is stamped unique per instance
const cfg = engine.getTrackConfig("ball-track"); // parsed from the schema at load
const ballTrack = createTrack(
  { ...cfg, id: `ball-track-${id}` }, // stamp: same def, unique identity
  engine.templates, // templates threaded (inline path dropped these)
);
parentTrack.addChild(ballTrack, { stagger });
```

This satisfies all three constraints the inline workaround violated:

- **Loaded-file source of truth** — the config comes from `#v4Project`, populated by `loadProject`. `spiralMotions.js` stays the single definition; the "dead" scene builders become live (read at runtime through the loaded project).
- **Multi-instance** — the `id` override is the same principle as Part A's `++counter` instanceId, applied to child tracks: same definition, unique identity, always fresh, never dedupe-destroy.
- **Deduped + templates honored** — keyframes written once; the `templates` arg to `createTrack` (silently dropped by the inline path) is threaded correctly.

### Why not route Spiral through `mountInstance` (Part A) instead?

Considered and rejected. A ball is a **child of the container's timeline**, added via `addChild` and reflowed by the container's `LayoutDelegate` on sibling removal. `mountInstance('spiral-zuma')` builds a _separate_ `Motion` with its _own_ master timeline — you would then have to reach in, pull `ball-track` out of that Motion's `TrackGroup`, and re-parent it into the container. Two timelines contending for ownership of one track, for zero benefit, since the ball needs no trigger. The Track-direct stamp keeps a ball as what it is: a bare track on the parent's timeline.

### Relationship to Part A

Part A (`mountInstance` swarm) and Part A′ (Track-direct swarm) are the **same one-line principle** — _separate the definition id from the instance id; read the definition from the loaded project; always build fresh, never dedupe-destroy_ — applied at two layers (full Motion vs. bare child Track). They are complementary, not alternatives. Part A′ has a concrete consumer **today** (Spiral's duplicated keyframes), so unlike Part B it is not speculative.

### Verification (Part A′)

1. `engine.getTrackConfig('ball-track')` returns the config flattened from `createSpiralBallScene`'s `tracks[0]` after `loadProject` — a unit test on `Engine` covers this against a motion (not just a top-level `tracks[]` entry).
2. `useSpiralWaveController.js` contains **no** inline `keyframes:` literals for ball/entrance/exit — all three `createTrack` calls stamp from `engine.getTrackConfig(...)`.
3. `BALL_SIZE` import in the controller is gone (it existed only to build the duplicated `--ball-size` keyframes; the schema owns them now). `BALL_SIZE` remains in `spiralPath.js` for spawn cadence — untouched.
4. `addChild`'s duplicate-track-id guard never trips — the `${id}` suffix keeps every stamped ball's id unique.
5. Browser: spawn / entrance / click-exit / auto-exit / wave-reset all still work; changing a keyframe in `spiralMotions.js` now visibly changes runtime behavior (proves it is the source of truth).

---

## Part B: Per-instance trigger-ref resolution (new capability)

### Problem this solves

`useMotionTrigger(id, ref)` registers a DOM ref under a single global string id via `TriggerRefRegistry`. A schema's scroll trigger config references anchors by that same string (e.g. `trigger: 'card-section'`). If `motionId: 'testimonial-reveal'` is mounted 3 times (one per card), all three instances' `ScrollTriggerDelegate.build()` calls `resolveElement('card-section')` — and get back the **same single registered element**, whichever card happened to register that id. Two of the three `ScrollTrigger`s end up bound to the wrong DOM node (or the registry throws on a second registration attempt, depending on `TriggerRefRegistry`'s current behavior — worth checking before implementing).

### Design: per-mount trigger-ref override map

`mountInstance` accepts an optional `triggerRefs` map in its `config`, resolved **before** falling back to the global registry:

```js
// Calling component — e.g. TestimonialCard, one per card, each with its own ref:
const cardSectionRef = useRef(null);
const instance = useMotionInstance(isLoaded ? "testimonial-reveal" : null, {
  triggerRefs: { "card-section": cardSectionRef },
});
```

```js
// Engine.mountInstance — sketch, not final
mountInstance(motionId, config = {}) {
  ...
  const localOverrides = config.triggerRefs ?? {};
  const resolveElementForThisInstance = (id) => {
    if (id in localOverrides) {
      const ref = localOverrides[id];
      return ref?.current ?? ref ?? null;   // accept either a React ref or a raw element
    }
    return this.resolveElement(id);          // fall back to the global TriggerRefRegistry
  };

  motion.init(resolveElementForThisInstance);
  ...
}
```

### Why this shape, not a namespaced-id scheme

Considered an alternative: prefix/namespace the global registry's string ids per instance (e.g. component registers `'card-3:card-section'`, schema resolution gets told the namespace at mount time). Rejected — it would require every call site of `useMotionTrigger` for a repeatable motion to manually construct a unique, collision-free namespace string, string-concatenation-matching the schema's literal id, which is more error-prone (silent mismatch = silently falls through to nothing, no build-time check) than just passing the ref directly. The override-map approach reuses a ref the calling component almost certainly already has (it's rendering the DOM node right there), skips the global registry entirely for the common "this trigger anchor is private to this one instance" case, and requires zero changes to `TriggerRefRegistry`, `useMotionTrigger`, or the schema shape — purely additive at the `mountInstance`/`Motion.init` boundary.

### Locked decisions (previously open questions, now resolved)

- **`triggerRefs` keys are validated against the schema's actual referenced trigger ids at mount time — fail loud on typo/mismatch.** Matches the project's standing "throw, don't silently strip" rule. A `triggerRefs` entry whose key doesn't match any id the schema's trigger config actually references (`trigger`/`sectionId`, `pin`, `startTrigger`, `endTrigger`) throws at `mountInstance` time, not a silent no-op.
- **`pin`/`startTrigger`/`endTrigger` use the exact same override mechanism as `trigger` — no special-casing needed.** This isn't actually a separate design question: `resolveElementForThisInstance(id)` operates purely on the string id being resolved, with zero awareness of which schema field that id came from. Whether a given id should be instance-private or page-level-shared is entirely the _calling component's_ choice, made per-id, simply by whether that id is included in its own `triggerRefs` map:

  ```js
  // Repeated case-study section, N instances down a page, one schema motionId.
  useMotionInstance("case-study-reveal", {
    triggerRefs: {
      "case-study-section": sectionRef, // this card's own section — private, override it
      "case-study-stage": stageRef, // this card's own pinned stage — private, override it
      // 'footer-id' intentionally NOT included — falls through to the global
      // TriggerRefRegistry, resolving to the one shared, page-level footer,
      // registered once via a single useMotionTrigger('footer-id', footerRef)
      // near the actual <Footer/> component.
    },
  });
  ```

  `trigger`/`pin` will typically always be overridden (they're conceptually private to one instance); `startTrigger`/`endTrigger` will typically be left out (they more often reference a shared, page-level anchor) — but nothing in the mechanism enforces that split; it's just how the two patterns tend to be used in practice, based on current schema precedent (`endTrigger: 'footer-id'` in the existing docs).

---

## Part B, Alternative 2 (under consideration, not decided — analyze against the design above before choosing)

### The idea

`useMotionTrigger(id, ref)` returns a **token** representing the registration, and that token becomes a **required** argument wherever a motion needing a DOM-anchored trigger gets mounted — for at least `scroll`-type motions, possibly others. Instead of a schema string and a hook call being connected only by both authors typing the same id correctly, the calling code passes the token forward explicitly:

```js
function TestimonialCard() {
  const sectionRef = useRef(null);
  const sectionTrigger = useMotionTrigger('card-section', sectionRef); // returns a token now

  const instance = useMotionInstance('testimonial-reveal', {
    trigger: sectionTrigger, // required for this motion's trigger type — passing nothing throws
  });
  ...
}
```

### What problem this solves, specifically

Today, a mismatched or forgotten trigger id fails silently-ish: nothing breaks until `Motion.init()` calls `resolveElement()` and throws, at a point in the code far from wherever the actual mistake (a typo, a forgotten `useMotionTrigger` call) was made. Making the token a required, explicit argument moves the failure to the call site itself — the mistake is a missing/wrong variable in the component's own code, not a string-matching failure discovered downstream.

### Where this is honestly weaker than it sounds

- **This is a plain-JS codebase, not TypeScript** (confirmed — every file touched so far is `.js`/`.jsx`). "Mandatory" here can only mean "throws immediately with a clear message if omitted," not a compile-time guarantee. Real value, but a narrower claim than "mandatory" implies.
- **Overlaps directly with the override-map design above, rather than being additive to it.** Both are solving "get a per-instance DOM ref to `resolveElement`." Shipping both would mean two different ways to supply the same thing (a `triggerRefs` map entry vs. a required `trigger` token argument) — worse than either alone. Whichever direction is chosen should absorb the other, not coexist with it.
- **Schemas here are deliberately written once, at module scope, reused across mounts** (the established "define project as a constant, don't recreate on every render" pattern). If the token becomes a hard requirement threaded through `mountInstance`'s call, the schema alone can no longer fully describe a motion — the calling site's code becomes co-responsible for satisfying that requirement. Probably an acceptable tradeoff, but a real one, not free.
- **Scope of "required" needs pinning down.** Required for every trigger type, or only ones that genuinely need a DOM anchor (`scroll`, and `pin`/`startTrigger`/`endTrigger` when used) — `time`/`manual` motions don't reference any DOM element at all today, so a blanket "always required" rule would force meaningless tokens onto motions that don't need one.

### Comparison, side by side

|                           | Override-map (Part B design above)                                                          | Token-required (Alternative 2)                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default behavior          | Optional — omit an id, falls through to global registry                                     | Would need to define what "optional" even means once something is a required argument                                                              |
| Failure mode on mistake   | Runtime throw inside `Motion.init()`, at mount time, error names the missing id             | Throw at the `mountInstance`/hook call site itself, closer to the actual mistake                                                                   |
| Schema/component coupling | Schema strings and hook calls still only connected by matching ids                          | Component code holds a real reference/token, not just a matching string                                                                            |
| New API surface           | `triggerRefs` config key on `mountInstance`; no change to `useMotionTrigger`'s return value | `useMotionTrigger` return value changes (currently returns nothing); `useMotionInstance`/`mountInstance` config shape changes to accept/require it |
| Backward compatibility    | Fully additive — every existing call site (`CarouselDemo`, etc.) needs zero changes         | Existing call sites might need updating depending on how "required" is scoped and enforced                                                         |

**Not resolved. Analyze further before picking one — flagged explicitly as competing designs for the same problem, not to be built in parallel.**

---

## 4. Suggested Sequencing

1. **Part A first, on its own** — fixes the live TowerDefense-shaped bug immediately, zero new API surface, safe given `unmountInstance` has no callers.
2. **Part A′ whenever the Track-direct duplication is addressed** — has a concrete consumer today (Spiral's duplicated keyframes), independent of Part A (different layer, no shared code), so it can land before or after A. Small and contained: two read-only accessors on `Engine` + rewriting the caller's inline `createTrack`s to stamp from `getTrackConfig`.
3. **Part B only if/when a concrete need appears** — e.g. if a future demo actually needs a repeated scroll-triggered section. No demo currently needs it; don't build it speculatively ahead of a real use case (YAGNI, consistent with how `setObserved`/event-trigger-type were also left unbuilt pending concrete need).

## 5. Verification checklist (for whenever Part A is actually implemented)

1. Grep: `this.#instances.set(motion.id` → confirm it now uses a counter-based id, not `motionConfig.id`.
2. Grep: no remaining "destroy existing entry for this motionId" branch in `mountInstance`.
3. Unit test: call `engine.mountInstance('some-motion')` twice in a row without destroying the first — assert both returned instances are alive simultaneously (e.g. both still respond to `.getTrack()`/`.progress()` without throwing), matching the TowerDefense multi-enemy scenario directly.
4. Regression test for the single-instance case: `useMotionInstance`-style mount → unmount → remount still produces exactly one live instance at a time, no leak (this exercises the _removed_ dedupe logic's replacement: cleanup now happens purely via the caller's own `.destroy()` call, never via the engine noticing a key collision).
5. Full suite run — confirm no existing demo relied on the old "second mountInstance call for the same motionId silently replaces the first" behavior (unlikely, since no demo currently calls `mountInstance` twice for the same id outside TowerDefense's already-broken pattern, but worth checking `PasarMalamPage`/`SpiralPage` for any repeated-mount pattern before assuming it's safe).
