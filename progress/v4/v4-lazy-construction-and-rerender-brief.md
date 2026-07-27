# Implementation Brief: Lazy Instance Construction + Composition Re-Render Fix (v4)

**Branch:** `v4`
**Type:** Two related, sequenced regressions — both lost in translation from v3, neither a new feature
**Supersedes:** `v4-lazy-instance-construction-brief.md` (this brief includes and extends it — use this one)

---

## Step 0 — Verification Gate (do this before writing any code)

```bash
git clone <repo> && cd motionpath && git checkout v4
grep -n "await createTrack" src/lib/schema/parseV4Project.js
grep -n "lazy = false" src/lib/Motion.js
grep -n "scrollTrigger.refresh\|scrollTrigger.update" src/lib/Motion.js
grep -n "\.then(" src/components/Demo/DemoPage.jsx
```

Expected findings (confirms both bugs are real, current, and connected):

- `parseV4Project.js` builds every `Track`/`Motion` for the whole schema eagerly at `loadProject` time.
- `Motion`'s constructor takes `lazy = false` default and calls `init()` immediately unless `lazy: true`; `lazy` is set to `triggerType === 'scroll'` at the one call site in `Engine.js`.
- `Motion.init()` calls `this.#masterTimeline.scrollTrigger.refresh()` and `.update()` unconditionally, once, right after mounting `#initialTracks`.
- `DemoPage.jsx` calls `createTrack(...).then(...)` and `Promise.all(...map(createTrack...))` at three sites (`CarouselDemo`'s child-track effect, `HelixDemo`'s child-track effect, `CarouselCard`'s exit-track handler).

If any of these don't match current source, stop and re-report actual findings — do not implement against a stale description.

---

## 1. Problem Statement (two parts, causally linked)

### 1a. Eager construction (original finding)

**v3 reference** (confirmed via `BaseEngine.js` + `CreateMotionInstance.js`): `loadProject()` only parses schema and warms plugin caches (`await ensureLoaded(plugin)` for every plugin referenced anywhere). `mountInstance(motionId)` is **synchronous** — it builds the real `MotionInstance` (GSAP tween/timeline) for that one motion only, on demand.

**v4 current:** `parseV4Project()` eagerly `await createTrack()`s and constructs every `Motion`/`Track` for the **entire schema** at `loadProject` time, regardless of what ever gets mounted. `Engine.mountInstance()` today does no construction — just a lookup.

### 1b. Composition re-render gap under scroll (found while investigating why fixing 1a alone isn't sufficient)

**v3 reference** (confirmed via `MotionInstance.js` `#setupDriver`/`addChild`/`#reflowSiblings`, direct trace, no assumptions): `ScrollTrigger.create()` is called once at driver setup with **zero** `.refresh()`/`.update()` calls anywhere in that path. What v3 _does_ do, inside `#reflowSiblings` (the engine-internal cascade triggered by `removeChild`), is a plain GSAP re-render trick: `this.timeline.time(this.timeline.time())` — reassigning the timeline's own current time to itself, forcing every nested child to re-render at the timeline's current position. This is pure `gsap.timeline` API — no `ScrollTrigger`, no DOM, no React involved.

**v4 current:** `TrackGroup.mount()`/`_mountChild()`/`_unmountChild()` call `this.#masterTimeline.add(tween, position)` and stop. Confirmed empirically (Node repro against the real `gsap` package, no DOM/ScrollTrigger needed — this isn't a scroll-specific question): a tween added to an already-progressed timeline sits at its own default value (`progress: 0`) until the _next_ explicit `.progress()`/`.time()` call on the timeline. If nothing re-applies the current position right after the `.add()`, and the user isn't actively scrolling at that exact moment, the newly added content stays invisible indefinitely — this is the "cards stuck at start" symptom.

Separately, `Motion.init()`'s `scrollTrigger.refresh()`/`.update()` calls are **not** ported from v3 (confirmed absent from `#setupDriver`) and are not the fix for 1b — `ScrollTrigger.refresh()` re-measures DOM/pixel geometry (a page-layout concern), which is unrelated to a GSAP timeline's internal progress-to-child-value application (a pure animation-engine concern). These calls should be removed, not extended.

### Why 1a makes 1b unavoidable, structurally

Before 1a is fixed, `Motion`/`ScrollTrigger` construction and `DemoPage`'s dynamic card-adding are both tangled into the same eager parse path, so their relative timing is accidental. After 1a is fixed, they become two **guaranteed-separate** React effects: `useMotionInstance`'s effect calls `mountInstance()` (building `Motion`/`ScrollTrigger` synchronously), which triggers a re-render, and only _then_ does `CarouselDemo`'s own effect fire and start calling `addChild()`. This is structurally the "B2" scenario the v3 team's own `RefreshSpikePage.jsx` spike anticipated (children registering after `ScrollTrigger` already exists) — a real, new-to-v4 capability, not a v3 regression. It needs 1b's fix to work correctly.

**Fix order matters: implement 1a first, then 1b. Fixing 1b alone without 1a would mask the problem only by accident of current tangled timing; fixing 1a alone without 1b reintroduces exactly the stuck-card symptom, now deterministically instead of by accident.**

---

## 2. Locked Decisions (non-negotiable, do not relitigate mid-implementation)

- `loadProject()` remains the single place that warms **all** schema-referenced plugins via `ensureLoaded()`, even for motions never mounted (v3 parity — fail fast on a broken lazy plugin at load time).
- `createTrack()` becomes synchronous. Its internal `ensureLoaded()` loop is removed — redundant once `loadProject` has already warmed every plugin the schema could reference.
- `mountInstance()` becomes the sole construction point for `Track`/`Motion` GSAP objects, synchronous, matching v3.
- Remounting the same `motionId` rebuilds fresh — no instance reuse across remounts (no concrete use case for pooling; GSAP timelines aren't safely reused across remounts anyway).
- **`Motion`'s `lazy` flag and the `init()`/constructor split are deleted.** Once construction only ever happens inside `mountInstance()` (itself only ever called from a mounted component's `useEffect`, per `useMotionInstance.js`), every trigger type gets the same "never built before something asks for it" guarantee uniformly — no per-trigger-type special-casing needed.
- **`Motion.init()`'s `scrollTrigger.refresh()`/`.update()` calls are deleted, not relocated.** Not ported from v3, not the fix for anything — `ScrollTrigger.refresh()` is a DOM/layout re-measurement concern. If a future demo genuinely needs it (e.g. a pinned section whose height must grow with dynamically spawned content), that belongs in an opt-in React hook analogous to v3's `useDynamicHeight.js` — which subscribes to a composition-change notification and recalculates layout at the React layer — never unconditionally inside the engine.
- **`TrackGroup` gains a one-line, DOM-agnostic re-render step after every structural mutation.** `this.#masterTimeline.time(this.#masterTimeline.time())` after `.add()` in `mount()` and after `.remove()` in `unmount()`. Pure `gsap.timeline` API, zero `ScrollTrigger`/DOM awareness — works identically for scroll, time, and manual triggers. This is the actual fix for "cards stuck at start," matching v3's own engine-internal precedent (`#reflowSiblings`'s `this.timeline.time(this.timeline.time())`), not a `ScrollTrigger.refresh()` call.
- `DemoPage.jsx`'s three `createTrack(...).then(...)` call sites become synchronous once `createTrack` is synchronous — this is a mechanical consequence of the `createTrack` signature change, not a separate design decision.

## 3. Non-Goals

- Do NOT change plugin lazy-loading (`ensureLoaded`, `loadPromises`, the four `createUnsupportedLazyPlugin` stubs) — correct, out of scope.
- Do NOT change validator rules, schema shape, or `TriggerDelegate` contracts beyond removing the two `Motion.init()` refresh calls.
- Do NOT introduce instance pooling, prefetching, or a `useDynamicHeight`-style hook for `CarouselDemo`/`HelixDemo` — their stage has a fixed CSS height; cards move along one shared path inside it, not a growing pinned section. No concrete need for dynamic-height logic in this demo.
- Do NOT add a `TriggerDelegate.refresh()` capability or any `ScrollTrigger`-aware method to `Track`/`TrackGroup`/`Motion`. The fix is intentionally DOM/trigger-agnostic.
- Do NOT change `TrackGroup.destroy()`'s bulk-kill path — it's tearing everything down, no re-render needed there.
- Do NOT touch `Track.addChild`/`removeChild`/`GaplessLayoutDelegate` composition math (spawn/reflow placement) — that logic is already correct and matches v3's `computeSpawnDelay`/`computeReflow` precedent; this brief only closes the "newly added content isn't rendered at the timeline's current position" gap.

---

## 4. CORRECT / WRONG Pairs

### 4.1 `parseV4Project.js` — config parsing + plugin warm-up only

**WRONG (current):**

```js
for (const motionConfig of rawMotions) {
  ...
  for (const trackConfig of motionTracks) {
    const track = await createTrack(trackConfig, templates); // builds real GSAP tween NOW
    motion.mount(track, position);
  }
}
```

**CORRECT:**

```js
export async function parseV4Project(schema = {}, deps = {}) {
  const templates = schema.templates || [];
  const rawMotions = schema.motions || [];
  const rawTracks = schema.tracks || [];

  for (const motionConfig of rawMotions) {
    const triggerType = motionConfig.trigger?.type;
    if (!triggerType)
      throw new Error(
        `Motion "${motionConfig.id}" is missing required trigger.type.`,
      );
    if (!triggerDelegateRegistry.get(triggerType)) {
      throw new Error(
        `Unknown trigger type "${triggerType}" on motion "${motionConfig.id}"...`,
      );
    }
  }

  const pluginsToLoad = new Set();
  const collectPlugins = (trackConfig) => {
    for (const key of Object.keys(trackConfig.keyframes || {})) {
      const plugin = resolvePluginForKey(key);
      if (plugin) pluginsToLoad.add(plugin);
    }
  };
  for (const motionConfig of rawMotions)
    (motionConfig.tracks || []).forEach(collectPlugins);
  rawTracks.forEach(collectPlugins);
  for (const plugin of pluginsToLoad) await ensureLoaded(plugin);

  const motionConfigsMap = new Map(rawMotions.map((m) => [m.id, m]));
  const trackConfigsMap = new Map(rawTracks.map((t) => [t.id, t]));

  return {
    templates,
    motionConfigsMap,
    trackConfigsMap,
    getMotionConfig: (id) => motionConfigsMap.get(id),
    getTrackConfig: (id) => trackConfigsMap.get(id),
  };
}
```

### 4.2 `createTrack.js` — drop the internal plugin-load loop, become sync

**WRONG (current):**

```js
export async function createTrack(config, templates = []) {
  const resolvedTrack = resolveTrack(config, templates);
  ...
  for (const propKey of propKeys) {
    const plugin = resolvePluginForKey(propKey);
    if (plugin) await ensureLoaded(plugin); // redundant once loadProject warms everything first
  }
  const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(...);
  return new Track({...});
}
```

**CORRECT:**

```js
export function createTrack(config, templates = []) {
  const resolvedTrack = resolveTrack(config, templates);
  if (!resolvedTrack)
    throw new Error("createTrack: invalid track configuration.");

  const keyframes = resolvedTrack.keyframes || {};
  const duration = resolvedTrack.duration ?? 1;
  const { proxy, tween, resolvedPlugins } = buildTrackTweenSync(
    resolvedTrack.id,
    keyframes,
    duration,
    resolvedTrack,
  );

  return new Track({
    id: resolvedTrack.id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins: resolvedPlugins,
    resolvedTrack,
    layoutDelegate: config.layoutDelegate,
  });
}
```

Assumes every plugin `resolvePluginForKey` can return is already loaded by the time `createTrack` runs — true as long as `createTrack` is only ever called after `loadProject` has resolved (i.e., from `mountInstance` or from app code like `DemoPage`'s card-adding effects, both of which only run post-load).

### 4.3 `Motion.js` — delete `lazy`/`init()` split; delete unjustified refresh calls; add `TrackGroup` re-render step

**WRONG (current):**

```js
export class TrackGroup {
  ...
  mount(track, position) {
    track._mount(this);
    const tween = gsap.to(track, { progress: 1, ease: 'none' });
    this.#proxies.set(track.id, tween);
    this.#tracks.set(track.id, track);
    this.#masterTimeline.add(tween, position);
  }

  unmount(track) {
    const tween = this.#proxies.get(track.id);
    if (tween) {
      this.#masterTimeline.remove(tween);
      tween.kill();
      this.#proxies.delete(track.id);
    }
    this.#tracks.delete(track.id);
    track._unmount();
  }
  ...
}

export class Motion {
  ...
  constructor({ id, triggerDelegate, lazy = false }, deps = {}) {
    this.id = id;
    this.trigger = triggerDelegate;
    if (!lazy) {
      this.init(deps.resolveElement ?? (() => null));
    }
  }

  init(resolveElement) {
    if (this.#active) { this.destroy(); }
    this.#active = true;
    this.#masterTimeline = this.trigger.build(resolveElement);
    this.#group = new TrackGroup(this.#masterTimeline);
    for (const { track, position } of this.#initialTracks) {
      this.#group.mount(track, position);
    }
    if (this.#masterTimeline.scrollTrigger) {
      this.#masterTimeline.scrollTrigger.refresh();
      this.#masterTimeline.scrollTrigger.update();
    }
  }
  ...
}
```

**CORRECT:**

```js
export class TrackGroup {
  ...
  mount(track, position) {
    track._mount(this);
    const tween = gsap.to(track, { progress: 1, ease: 'none' });
    this.#proxies.set(track.id, tween);
    this.#tracks.set(track.id, track);
    this.#masterTimeline.add(tween, position);
    // Force every nested child to re-render at the timeline's CURRENT position.
    // Pure gsap.timeline API — no ScrollTrigger/DOM awareness. Without this, a
    // tween added after the timeline has already progressed sits at its own
    // default value (progress:0) until the next external progress-set call,
    // which under scroll-scrub only happens on the next scroll event. Mirrors
    // v3's MotionInstance#reflowSiblings: this.timeline.time(this.timeline.time()).
    this.#masterTimeline.time(this.#masterTimeline.time());
  }

  unmount(track) {
    const tween = this.#proxies.get(track.id);
    if (tween) {
      this.#masterTimeline.remove(tween);
      tween.kill();
      this.#proxies.delete(track.id);
    }
    this.#tracks.delete(track.id);
    track._unmount();
    this.#masterTimeline.time(this.#masterTimeline.time());
  }
  ...
}

export class Motion {
  ...
  constructor({ id, triggerDelegate }, deps = {}) {
    this.id = id;
    this.trigger = triggerDelegate;
    this.init(deps.resolveElement ?? (() => null));
  }

  init(resolveElement) {
    if (this.#active) { this.destroy(); }
    this.#active = true;
    this.#masterTimeline = this.trigger.build(resolveElement);
    this.#group = new TrackGroup(this.#masterTimeline);
    for (const { track, position } of this.#initialTracks) {
      this.#group.mount(track, position);
    }
    // No scrollTrigger.refresh()/.update() here — not ported from v3, not
    // needed. TrackGroup.mount's own re-render step (above) is sufficient
    // and correctly DOM/trigger-agnostic.
  }
  ...
}
```

`_mountChild`/`_unmountChild` on both classes need no changes — they already delegate to `mount`/`unmount`, which now carry the re-render step.

### 4.4 `Engine.mountInstance` — the actual construction point, synchronous

**WRONG (current — just a lookup):**

```js
mountInstance(motionId, config = {}) {
  const motion = this.#v4Project.getMotion(motionId);
  if (motion) {
    motion.init((id) => this.resolveElement(id));
    this.#instances.set(motion.id, motion);
    return motion;
  }
  const track = this.#v4Project.getTrack(motionId);
  ...
}
```

**CORRECT:**

```js
mountInstance(motionId, config = {}) {
  if (!this.#v4Project) throw new Error('mountInstance: project not loaded.');

  const motionConfig = this.#v4Project.getMotionConfig(motionId);
  if (motionConfig) {
    const { templates } = this.#v4Project;
    const triggerType = motionConfig.trigger.type; // already validated in parseV4Project
    const delegate = triggerDelegateRegistry.get(triggerType)(motionConfig.trigger);
    const motion = new Motion({ id: motionConfig.id, triggerDelegate: delegate }, {
      resolveElement: (id) => this.resolveElement(id)
    });

    const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
    const motionTracks = motionConfig.tracks || [];
    for (let i = 0; i < motionTracks.length; i++) {
      const track = createTrack(motionTracks[i], templates); // sync now
      motion.mount(track, i * stagger);
    }

    this.#instances.set(motion.id, motion);
    return motion;
  }

  const trackConfig = this.#v4Project.getTrackConfig(motionId);
  if (trackConfig) {
    const track = createTrack(trackConfig, this.#v4Project.templates);
    this.#instances.set(track.id, track);
    return track;
  }

  throw new Error(`mountInstance: motion or track "${motionId}" not found in project.`);
}
```

Note: `i * stagger` here spaces **schema-declared top-level tracks** within one motion (e.g. if a motion ever declares 2+ tracks). For `carousel-storytelling`/`helix-storytelling`, there is exactly one schema track, so this always resolves to position `0` — irrelevant to the dynamic per-card stagger, which is a completely separate value passed explicitly to `addChild(track, { stagger })` by `DemoPage.jsx`. Do not conflate the two `stagger` uses.

### 4.5 `DemoPage.jsx` — sync fallout from `createTrack` no longer returning a Promise

**WRONG (current, `CarouselDemo`'s child-track effect):**

```js
useEffect(() => {
  const parentTrack = parentTrackRef.current;
  if (!parentTrack) return;
  const map = childTracksMapRef.current;
  const missingCards = cards.filter((c) => !map.has(c.id));
  if (missingCards.length === 0) return;

  let cancelled = false;
  const trackCfg = dynamicCarouselScene.tracks[0];
  Promise.all(
    missingCards.map((card) =>
      createTrack({
        id: `carousel-child-${card.id}`,
        keyframes: trackCfg.keyframes,
      }).then((track) => ({ cardId: card.id, track })),
    ),
  ).then((results) => {
    if (cancelled) return;
    for (const { cardId, track } of results) {
      if (!map.has(cardId)) {
        parentTrack.addChild(track, { stagger: dynamicCarouselScene.stagger });
        map.set(cardId, track);
      }
    }
    setTrackVersion((v) => v + 1);
  });

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cards, instance, trackVersion === 0 ? instance : null]);
```

**CORRECT:**

```js
useEffect(() => {
  const parentTrack = parentTrackRef.current;
  if (!parentTrack) return;
  const map = childTracksMapRef.current;
  const missingCards = cards.filter((c) => !map.has(c.id));
  if (missingCards.length === 0) return;

  const trackCfg = dynamicCarouselScene.tracks[0];
  for (const card of missingCards) {
    const track = createTrack({
      id: `carousel-child-${card.id}`,
      keyframes: trackCfg.keyframes,
    });
    parentTrack.addChild(track, { stagger: dynamicCarouselScene.stagger });
    map.set(card.id, track);
  }
  setTrackVersion((v) => v + 1);
}, [cards, instance]);
```

`trackVersion` state itself can be deleted along with its `setTrackVersion` calls — it existed to force a second effect pass after an async batch resolved; with synchronous `createTrack`, the whole effect completes in one pass. Its remaining use (forcing `CarouselDemo`'s render to pick up newly-populated `childTracksMapRef` entries) still needs _some_ re-render trigger since the map is a ref, not state — keep a single `setTrackVersion(v => v + 1)` call at the end for that reason, but drop the `trackVersion === 0 ? instance : null` dependency hack entirely; it's no longer needed once there's no async second pass to guard against.

**WRONG (current, `HelixDemo`'s child-track effect):**

```js
useEffect(() => {
  if (!instance) return;
  const parentTrack = instance.getTrack("helix-card-track");
  if (!parentTrack) return;

  let cancelled = false;
  const helixCards = MOCK_CARDS.slice(0, 6);
  const trackCfg = dynamicHelixScene.tracks[0];
  Promise.all(
    helixCards.map((_, i) =>
      createTrack({ id: `helix-child-${i}`, keyframes: trackCfg.keyframes }),
    ),
  ).then((tracks) => {
    if (cancelled) return;
    childTracksRef.current = tracks;
    tracks.forEach((track) =>
      parentTrack.addChild(track, { stagger: dynamicHelixScene.stagger }),
    );
    setHelixTracksReady(true);
  });

  return () => {
    cancelled = true;
  };
}, [instance]);
```

**CORRECT:**

```js
useEffect(() => {
  if (!instance) return;
  const parentTrack = instance.getTrack("helix-card-track");
  if (!parentTrack) return;

  const helixCards = MOCK_CARDS.slice(0, 6);
  const trackCfg = dynamicHelixScene.tracks[0];
  const tracks = helixCards.map((_, i) =>
    createTrack({ id: `helix-child-${i}`, keyframes: trackCfg.keyframes }),
  );
  childTracksRef.current = tracks;
  tracks.forEach((track) =>
    parentTrack.addChild(track, { stagger: dynamicHelixScene.stagger }),
  );
  setHelixTracksReady(true);
}, [instance]);
```

**WRONG (current, `CarouselCard`'s exit handler):**

```js
createTrack({
  id: `exit-${cardData.id}`,
  keyframes: { scale: {...}, opacity: {...} },
  duration: 0.4
}).then(exitTrack => {
  setActiveTrack(exitTrack);
  gsap.to(exitTrack, {
    progress: 1, duration: 0.4, ease: 'none',
    onComplete: () => { exitTrack.destroy(); onRemove(cardData.id, cardTrack); }
  });
});
```

**CORRECT:**

```js
const exitTrack = createTrack({
  id: `exit-${cardData.id}`,
  keyframes: { scale: {...}, opacity: {...} },
  duration: 0.4
});
setActiveTrack(exitTrack);
gsap.to(exitTrack, {
  progress: 1, duration: 0.4, ease: 'none',
  onComplete: () => { exitTrack.destroy(); onRemove(cardData.id, cardTrack); }
});
```

Note: `gsap.to(exitTrack, {progress: 1, ...})` was already correct as-is (relies on `Track` being GSAP-accessor-shaped per the locked design — `Track#progress()` duck-types for `gsap.to`). No proxy-object indirection needed here; only the `.then()` wrapper comes off.

---

## 5. Verification Checklist (mandatory — grep + live repro, per standing project methodology)

1. **Grep — no eager construction remains:**
   ```bash
   grep -n "await createTrack" src/lib/schema/parseV4Project.js   # expect: no matches
   grep -n "new Motion(" src/lib/schema/parseV4Project.js         # expect: no matches
   ```
2. **Grep — no `.then(` left on `createTrack` calls:**
   ```bash
   grep -n "createTrack(.*)\.then\|createTrack(" src/components/Demo/DemoPage.jsx
   ```
3. **Grep — `lazy` flag and refresh calls fully removed:**
   ```bash
   grep -n "lazy" src/lib/Motion.js                    # expect: no matches
   grep -n "scrollTrigger.refresh\|scrollTrigger.update" src/lib/Motion.js  # expect: no matches
   grep -n "masterTimeline.time(" src/lib/Motion.js    # expect: 2 matches (mount, unmount)
   ```
4. **Unit test — partial mount, count instances built:** load a project with ≥3 motions, mount only 1, spy/count `createTrack` calls — assert exactly that motion's tracks were built.
5. **Unit test — plugin warm-up still project-wide:** a project referencing a lazy plugin only in a never-mounted motion should still throw/reject at `loadProject()` time if the plugin is unavailable.
6. **Unit test — remount rebuilds fresh:** `mountInstance(id)` → `unmountInstance(id)` → `mountInstance(id)` produces a new object reference.
7. **Unit test — late `addChild` under an already-progressed timeline renders immediately:** build a `Motion` with a manual/time trigger (no DOM/ScrollTrigger needed for this one), advance its timeline to some non-zero progress, call `track.addChild(childTrack, {...})`, and assert `childTrack`'s proxy state reflects a non-zero value **without** any further `.progress()`/`.time()` call from the test. This is the direct regression test for the `TrackGroup.mount` fix — reproduce the Node-level repro from this investigation as an actual Vitest case.
8. **Live reproduction (real browser or jsdom+ResizeObserver, real async GSAP timing):** mount `CarouselDemo`/`HelixDemo` in the actual demo tree, scroll partway into the pinned section, confirm cards render immediately once their child tracks are added — not just on the next scroll tick.
9. **Live reproduction — scroll-type Motion with `lazy` removed:** confirm `resolveElement` succeeds and `ScrollTrigger` builds correctly for a scroll-triggered motion whose trigger anchor comes from a sibling component using `useMotionTrigger`, in real demo tree order.
10. **Full diff review for scope creep** — this brief touches `parseV4Project.js`, `createTrack.js`, `Motion.js`, `Engine.js`, and `DemoPage.jsx`. Nothing else (no drive-by changes to `GaplessLayoutDelegate.js`, validators, or unrelated demo components).

---

## 6. Files Expected to Change

- `src/lib/schema/parseV4Project.js` — config parsing + plugin warm-up only
- `src/lib/createTrack.js` — drop `ensureLoaded` loop, becomes sync
- `src/lib/Motion.js` — remove `lazy`/`init()` split; remove `scrollTrigger.refresh()/.update()`; add `masterTimeline.time(masterTimeline.time())` re-render step in `TrackGroup.mount`/`unmount`
- `src/engines/Engine.js` — `mountInstance` becomes the construction point
- `src/components/Demo/DemoPage.jsx` — drop `.then()` on all three `createTrack` call sites; delete `trackVersion`'s async-guard dependency hack (keep a single re-render trigger); no change needed to the exit-track `gsap.to(exitTrack, {...})` call itself
