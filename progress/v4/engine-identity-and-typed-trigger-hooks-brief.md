# Implementation Brief: Engine Instance Identity Fix + Typed Trigger Hooks

**Branch:** `v4`
**Supersedes:** `feature-swarm-part-a-brief.md` (Part A is now implemented as part of this shared refactor, not standalone) and the `triggerRefs`-override-map / mandatory-token designs in `feature-swarm-design.md` (Part B is dropped — this design eliminates the problem rather than solving around it; see reasoning below).
**Scope:** `Engine.js`, `Motion.js` (no changes needed — confirmed), `TriggerDelegate.js`, three new hooks, full migration of the only two real working consumers (`DemoPage.jsx`, `PasarMalamPage.jsx`), deletion of `TriggerRefRegistry`/`useMotionTrigger`.

---

## Step 0 — Verification Gate

```bash
grep -n "this.#instances.set(motion.id" src/engines/Engine.js
grep -n "existing.destroy" src/engines/Engine.js
grep -rn "unmountInstance(" src/ --include=*.js --include=*.jsx
grep -n "typeof triggerRef === 'string'" src/lib/TriggerDelegate.js
grep -n "^  id: '" src/components/Demo/DemoPage.jsx src/components/PasarMalam/PasarMalamPage.jsx
grep -rn "useMotionTrigger(" src/components/*/*.jsx
```

Expected findings:

- `Engine.#instances` still keyed by `motion.id` = schema `motionConfig.id` (unfixed as of this brief).
- `mountInstance` still destroys-and-replaces on the same motionId.
- `unmountInstance` has zero callers.
- `ScrollTriggerDelegate.build()` already branches on `typeof x === 'string'` — confirms it works unchanged with real DOM elements injected directly, no changes needed to this file for the element-injection part.
- Exactly 5 motions total need migrating: `hero-scrollytelling`, `carousel-storytelling`, `helix-storytelling` (all `scroll`, in `DemoPage.jsx`), `pasar-malam-storytelling` (`scroll`) and `lantern-bounce` (`time`, in `PasarMalamPage.jsx`).
- Exactly 12 `useMotionTrigger` call sites total, all in `DemoPage.jsx`/`PasarMalamPage.jsx`/`BurstPage.jsx`/`PasarMalamObserverPage.jsx` — the latter two are confirmed-broken stale v3 schemas (pending future migration, **out of scope for this brief** — do not touch them; they'll get their own migration pass separately when that happens).

If any of these don't match, stop and re-report before implementing.

---

## 1. Why Part A and this design are now one refactor, not two

Part A's problem (`Engine.#instances` keyed by schema `motionId`, destroying concurrent instances of the same motion) and this design's `mountWithDelegate` entry point share the exact same underlying need: build a `Motion`, its tracks, and register it, given a `motionConfig` and a `TriggerDelegate` — regardless of whether the delegate came from `triggerDelegateRegistry` + string-id resolution (the old path) or was pre-built by a typed hook with real DOM elements already injected (the new path). Extracting that shared logic into one private helper means Part A's fix (unique instance id, no dedupe-and-destroy) only has to be written once, and `mountWithDelegate` gets it automatically — there's no second implementation where the bug could be reintroduced.

## 2. Why Part B (the `triggerRefs` override map / mandatory-token designs) is dropped, not implemented alongside this

Both of those designs manage collisions in a shared global string-id namespace (`TriggerRefRegistry`) more gracefully. This design removes the shared namespace entirely — every `useScrollMotion` call builds its own delegate from its own component-local refs, so there is nothing to collide on. Ten concurrent instances of the same schema motion each just work, with zero id-matching machinery. Do not implement `triggerRefs` overrides or a mandatory-token variant on top of this — they'd be solving a problem this design doesn't have.

---

## 3. Locked Decisions

- **`Engine.#instances` for motions is keyed by a unique per-instance id** (`motion-${++counter}`), generated inside a shared private helper — never by schema `motionId`. Matches v3's `inst-${counter}` precedent.
- **The "destroy existing entry for this motionId" branch is removed entirely.**
- **`motion.motionId` is set to the schema id** as a plain property, for reference only — not the map key.
- **`Engine.unmountInstance(motionId)` is deleted.** Zero callers (confirmed). Every caller — `useMotionInstance`'s cleanup, `useScrollMotion`/`useTimeMotion`/`useManualMotion`'s cleanup, `TowerDefensePage`'s enemy-death path — holds the returned instance directly and calls `.destroy()` on it.
- **A new private helper, `#mountMotionWithDelegate(motionConfig, delegate)`, contains all the motion/track-building logic that used to live inline in `mountInstance`.** Both `mountInstance` (builds its own delegate via `triggerDelegateRegistry` + `resolveElement`) and the new public `mountWithDelegate` (accepts a pre-built delegate) call into this same helper. No duplicated track-building logic between the two paths.
- **The standalone-track branch of `mountInstance` (top-level schema `tracks[]`) is unchanged** — still keyed by schema id, per the original Part A brief's reasoning (no concurrent-instance need for it, `Engine.getTrack`'s contract depends on it).
- **`ScrollTriggerDelegate.build()`'s `resolveElement` parameter and its `typeof x === 'string'` branches are removed** once all consumers are migrated (Step 5 below) — schemas no longer carry string trigger ids at all after this brief, so the string-resolution path becomes genuinely dead code, not just unused-for-now.
- **`Motion.init()`'s signature drops `resolveElement`** — becomes `init()`, no arguments. Nothing needs it once every delegate either needs no DOM element (`time`/`manual`) or arrives pre-built with real elements already injected (`scroll`, via `mountWithDelegate`).
- **`TriggerRefRegistry.js`, `useMotionTrigger.js`, `engine.registerTriggerRef`/`unregisterTriggerRef`/`resolveElement` are deleted outright**, not deprecated-in-place. Only 2 real working files use them (`DemoPage.jsx`, `PasarMalamPage.jsx`), both migrated in this same brief — there's no transitional period where both paths need to coexist.
- **Cross-subtree trigger refs** (a trigger element rendered outside the component calling the motion hook): no special mechanism. Use standard React patterns — lift the ref, use Context, or an external store for genuinely global elements. No current demo needs this; don't build for it speculatively.
- **`pin: true | 'pin' | undefined`** schema convention, per the uploaded doc's Review Decisions: `true` pins the trigger element itself (the common case, matches GSAP's own mental model); a role-string (`'pin'`) means a separately-provided `refs.pin` ref is used. No `pinOverride` field — one field, three meanings, simplest maintainable shape.
- **Control methods stay on `instance.trigger`** — no `player`/`delegate` split in this brief. The rename/split proposed in the uploaded doc's "Delegate vs Player Split" section is a separate, smaller, purely-additive change with no dependency on anything here — deliberately out of scope for this brief to keep it focused. Revisit separately if wanted.
- **`useManualMotion` exposes both `instance` and a convenience `seek` alias** that delegates to `instance.trigger.progress()` (the current v4 method name) — not a new control abstraction. (The uploaded doc suggested renaming `progress()`→`seek()` for conceptual parity with the other delegates; **not decided here**, out of scope — `seek` the hook returns can internally call whichever method name is current without the public rename needing to happen first.)

## 4. Non-Goals

- Do NOT touch `BurstPage.jsx`, `MotorcyclePage.jsx`, `PasarMalamObserverPage.jsx` — confirmed stale v3-shaped schemas, pending future migration, explicitly out of scope.
- Do NOT implement the `triggerRefs` override map or mandatory-token designs (superseded, per §2).
- Do NOT implement the `Delegate` vs `Player` rename/split (separate, deliberately deferred).
- Do NOT rename `progress()`→`seek()` on `ManualTriggerDelegate` (separate, deliberately deferred, not decided).
- Do NOT add `startTrigger`/`endTrigger` handling beyond what already exists in `ScrollTriggerDelegate.build()` — no real current usage of either (confirmed: zero working demos use them), don't design further for a case with no driver.

---

## 5. CORRECT / WRONG

### 5.1 `Engine.js` — shared helper, `mountWithDelegate`, deleted `unmountInstance`

**WRONG (current):**

```js
export class Engine {
  #triggerRefs = new TriggerRefRegistry();
  #v4Project = null;
  #instances = new Map();

  mountInstance(motionId, config = {}) {
    if (!this.#v4Project) throw new Error('mountInstance: project not loaded.');

    const existing = this.#instances.get(motionId);
    if (existing) {
      existing.destroy?.();
      this.#instances.delete(motionId);
    }

    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (motionConfig) {
      const triggerType = motionConfig.trigger?.type;
      const factory = triggerDelegateRegistry.get(triggerType);
      if (!factory) throw new Error(`Unknown trigger type "${triggerType}" on motion "${motionId}".`);

      const delegate = factory(motionConfig.trigger);
      const motion = new Motion({
        id: motionConfig.id,
        triggerDelegate: delegate,
        staggerTransition: motionConfig.staggerTransition,
      });

      const stagger = typeof motionConfig.stagger === 'number' ? motionConfig.stagger : 0;
      const motionTracks = motionConfig.tracks || [];
      for (let i = 0; i < motionTracks.length; i++) {
        const track = createTrack(motionTracks[i], this.#v4Project.templates);
        motion.mount(track, i * stagger);
      }

      motion.init((id) => this.resolveElement(id));
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

  unmountInstance(motionId) {
    const inst = this.#instances.get(motionId);
    if (inst) {
      inst.destroy?.();
      this.#instances.delete(motionId);
    }
  }

  registerTriggerRef(id, ref) { this.#triggerRefs.register(id, ref); }
  unregisterTriggerRef(id, ref) { this.#triggerRefs.unregister(id, ref); }
  resolveElement(id) { return this.#triggerRefs.resolveElement(id); }
  ...
}
```

**CORRECT:**

```js
export class Engine {
  #v4Project = null;
  #instances = new Map();
  #instanceCounter = 0;

  // Shared by mountInstance (registry-built delegate) and mountWithDelegate
  // (pre-built delegate, real DOM elements already injected). Everything
  // about building the Motion/its tracks/registering it lives HERE, exactly
  // once — no second place where the unique-instance-id fix or track-
  // building could drift or be reintroduced incorrectly.
  #mountMotionWithDelegate(motionConfig, delegate) {
    // Unique per-instance id — NEVER the schema motionId. Lets the same
    // motionId be mounted any number of times concurrently (e.g. one
    // TowerDefense enemy instance per spawn, or N repeated scroll sections
    // via useScrollMotion, all sharing one schema motion). Matches v3:
    // MotionInstance generated inst-${counter}, independent of motionId,
    // and mountInstance never deduped or destroyed based on it.
    const instanceId = `motion-${++this.#instanceCounter}`;
    const motion = new Motion({
      id: instanceId,
      triggerDelegate: delegate,
      staggerTransition: motionConfig.staggerTransition,
    });
    motion.motionId = motionConfig.id; // schema id, for reference — not the map key

    const stagger =
      typeof motionConfig.stagger === "number" ? motionConfig.stagger : 0;
    const motionTracks = motionConfig.tracks || [];
    for (let i = 0; i < motionTracks.length; i++) {
      const track = createTrack(motionTracks[i], this.#v4Project.templates);
      motion.mount(track, i * stagger);
    }

    motion.init(); // no resolveElement argument — see Locked Decisions

    this.#instances.set(motion.id, motion);
    return motion;
  }

  mountInstance(motionId, config = {}) {
    if (!this.#v4Project) throw new Error("mountInstance: project not loaded.");

    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (motionConfig) {
      const triggerType = motionConfig.trigger?.type;
      const factory = triggerDelegateRegistry.get(triggerType);
      if (!factory)
        throw new Error(
          `Unknown trigger type "${triggerType}" on motion "${motionId}".`,
        );
      const delegate = factory(motionConfig.trigger);
      return this.#mountMotionWithDelegate(motionConfig, delegate);
    }

    // Standalone top-level tracks: deliberately UNCHANGED, still keyed by
    // schema id — see Part A brief's Locked Decisions for why.
    const trackConfig = this.#v4Project.getTrackConfig(motionId);
    if (trackConfig) {
      const track = createTrack(trackConfig, this.#v4Project.templates);
      this.#instances.set(track.id, track);
      return track;
    }

    throw new Error(
      `mountInstance: motion or track "${motionId}" not found in project.`,
    );
  }

  // New — for useScrollMotion/useTimeMotion/useManualMotion. Caller has
  // already built the delegate (with real DOM elements injected for scroll,
  // or no DOM dependency at all for time/manual) and just needs it wired
  // into a real Motion with its tracks built the same way mountInstance does.
  mountWithDelegate(motionId, delegate) {
    if (!this.#v4Project)
      throw new Error("mountWithDelegate: project not loaded.");
    const motionConfig = this.#v4Project.getMotionConfig(motionId);
    if (!motionConfig)
      throw new Error(
        `mountWithDelegate: motion "${motionId}" not found in project.`,
      );
    return this.#mountMotionWithDelegate(motionConfig, delegate);
  }

  // unmountInstance REMOVED — zero callers (confirmed). Every caller holds
  // the returned instance and calls .destroy() on it directly.
  // registerTriggerRef/unregisterTriggerRef/resolveElement REMOVED along
  // with TriggerRefRegistry.js — no string ids left to resolve.

  getTrack(trackId) {
    if (!this.#v4Project) return null;
    return this.#instances.get(trackId) ?? null;
  }

  destroy() {
    for (const inst of this.#instances.values()) {
      inst.destroy?.();
    }
    this.#instances.clear();
    this.#v4Project = null;
  }
}
```

### 5.2 `TriggerDelegate.js` — drop dead string-resolution paths

**WRONG (current):**

```js
export class ScrollTriggerDelegate {
  build(resolveElement) {
    const triggerRef = this.#config.trigger ?? this.#config.startTrigger ?? this.#config.sectionId;
    const triggerEl = typeof triggerRef === 'string' ? resolveElement(triggerRef) : triggerRef;
    const pinEl = typeof this.#config.pin === 'string' ? resolveElement(this.#config.pin) : this.#config.pin;
    const endTriggerEl = typeof this.#config.endTrigger === 'string' ? resolveElement(this.#config.endTrigger) : this.#config.endTrigger;
    ...
  }
}
```

**CORRECT:**

```js
export class ScrollTriggerDelegate {
  build() {
    // No resolveElement parameter, no string branches — every consumer now
    // injects real DOM elements directly into config before construction
    // (see useScrollMotion). The string-id path is genuinely dead once
    // schemas no longer carry string trigger ids at all (Step 5 below), not
    // just unused-for-now — remove it rather than leave an unreachable branch.
    const triggerEl = this.#config.trigger;
    const pinEl = this.#config.pin === true ? triggerEl : this.#config.pin;
    const endTriggerEl = this.#config.endTrigger;

    const scrollTriggerObj = {
      start: this.#config.start,
      end: this.#config.end,
      scrub: this.#config.scrub,
      pin: pinEl,
      pinSpacing: this.#config.pinSpacing,
      toggleActions: this.#config.toggleActions,
    };
    if (triggerEl) scrollTriggerObj.trigger = triggerEl;
    if (endTriggerEl) scrollTriggerObj.endTrigger = endTriggerEl;

    this.#timeline = gsap.timeline({ scrollTrigger: scrollTriggerObj });
    this.#controls = new AutonomousTimelineControls(this.#timeline);
    return this.#timeline;
  }
  ...
}
```

Note the `pin: true` handling moved here — `useScrollMotion` (below) passes `config.trigger` through as the injected element and leaves `pin` as either `true`, a real element (role-string case), or `undefined`; this delegate resolves `pin: true` to "same as trigger" at build time, matching the Locked Decision's convention.

`TimeTriggerDelegate.build()` and `ManualTriggerDelegate.build()` are unchanged — they never took a `resolveElement` parameter to begin with.

### 5.3 `Motion.js` — `init()` drops its parameter

**WRONG (current):** `init(resolveElement) { ...; this.#masterTimeline = this.trigger.build(resolveElement); ... }`

**CORRECT:** `init() { ...; this.#masterTimeline = this.trigger.build(); ... }`

No other changes to `Motion.js` — confirmed nothing else inside it reads `resolveElement` or depends on this signature.

### 5.4 New hook: `src/hooks/useScrollMotion.js`

```js
import { useEffect, useRef, useState } from "react";
import { engine } from "../engines/Engine.js";
import { ScrollTriggerDelegate } from "../lib/TriggerDelegate.js";

export default function useScrollMotion(schema) {
  const config = schema.trigger;
  const triggerRef = useRef(null);
  const pinRef = useRef(null);
  const endTriggerRef = useRef(null);
  const [instance, setInstance] = useState(null);

  useEffect(() => {
    if (!triggerRef.current) return undefined;

    const delegate = new ScrollTriggerDelegate({
      ...config,
      trigger: triggerRef.current,
      pin:
        config.pin === true
          ? true
          : config.pin === "pin"
            ? pinRef.current
            : undefined,
      endTrigger: config.endTrigger ? endTriggerRef.current : undefined,
    });

    const motion = engine.mountWithDelegate(schema.id, delegate);
    setInstance(motion);

    return () => {
      motion.destroy();
      setInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema.id]);

  const refs = {
    trigger: triggerRef,
    pin: config.pin === "pin" ? pinRef : undefined,
    endTrigger: config.endTrigger ? endTriggerRef : undefined,
  };

  return { refs, instance };
}
```

### 5.5 New hook: `src/hooks/useTimeMotion.js`

```js
import useMotionInstance from "./useMotionInstance.js";

// Thin wrapper — TimeTriggerDelegate needs no DOM refs at all. Exists mainly
// so call sites read consistently with useScrollMotion/useManualMotion, and
// so a future reader doesn't have to know time motions happen to need no refs.
export default function useTimeMotion(motionId, config) {
  const instance = useMotionInstance(motionId, config);
  return { instance };
}
```

### 5.6 New hook: `src/hooks/useManualMotion.js`

```js
import { useCallback } from "react";
import useMotionInstance from "./useMotionInstance.js";

export default function useManualMotion(motionId, config) {
  const instance = useMotionInstance(motionId, config);
  const seek = useCallback(
    (p) => {
      instance?.trigger?.progress(p);
    },
    [instance],
  );
  return { instance, seek };
}
```

### 5.7 Migrate `DemoPage.jsx` — 3 scroll motions

**WRONG (current, per motion, x3 — hero/carousel/helix):**

```js
const containerRef = useRef(null);
const stageRef = useRef(null);
useMotionTrigger("hero-scroll-trigger", containerRef);
useMotionTrigger("hero-stage-pin", stageRef);
const instance = useMotionInstance(isLoaded ? "hero-scrollytelling" : null);
```

Schema (unchanged shape, just showing the string ids being removed):

```js
trigger: {
  type: 'scroll',
  trigger: 'hero-scroll-trigger',
  pin: 'hero-stage-pin',
  ...
}
```

**CORRECT:**

```js
const { refs, instance } = useScrollMotion(scrollScene); // scrollScene = the hero motion's schema object
return (
  <section ref={refs.trigger}>
    <div ref={refs.pin}>...</div>
  </section>
);
```

Schema:

```js
trigger: {
  type: 'scroll',
  pin: 'pin', // trigger and pin are different elements in this demo — role-string form
  ...
}
```

Repeat for `carousel-storytelling` and `helix-storytelling` — same shape, each keeps its own `pin: 'pin'` (their stage is a distinct child element from the section, same as the current two-ref pattern already does).

### 5.8 Migrate `PasarMalamPage.jsx` — 1 scroll + 1 time motion

Scroll motion (`pasar-malam-storytelling`) — same pattern as 5.7.

Time motion (`lantern-bounce`) — currently:

```js
const bounceInstance = useMotionInstance(
  isLoaded ? "lantern-bounce" : null,
  BOUNCE_CONFIG,
);
useMotionTimelinePlayback(bounceInstance, bouncing);
```

Becomes:

```js
const { instance: bounceInstance } = useTimeMotion(
  isLoaded ? "lantern-bounce" : null,
  BOUNCE_CONFIG,
);
useMotionTimelinePlayback(bounceInstance, bouncing); // unchanged, already just calls .play()/.pause()
```

### 5.9 Delete

- `src/lib/TriggerRefRegistry.js`
- `src/hooks/useMotionTrigger.js`
- `registerTriggerRef`/`unregisterTriggerRef`/`resolveElement` methods on `Engine`

---

## 6. Verification Checklist

1. **Grep — keying fixed:** `this.#instances.set(motion.id` reflects `instanceId`-based generation; no `existing.destroy`/dedupe branch remains; `unmountInstance` fully removed.
2. **Grep — no string trigger ids remain** in `DemoPage.jsx`/`PasarMalamPage.jsx` schemas; `useMotionTrigger` import removed from both.
3. **Grep — `TriggerRefRegistry.js`/`useMotionTrigger.js` files deleted**, no remaining imports anywhere (`BurstPage.jsx`/`PasarMalamObserverPage.jsx` still import `useMotionTrigger` — confirm those are left alone per Non-Goals, not silently broken by this deletion; they're already non-functional under v4 regardless).
4. **Unit test — concurrent instances via `mountWithDelegate`:** call it twice for the same `motionId` with two different pre-built delegates (e.g. two `ManualTriggerDelegate`s standing in for two different DOM anchors), assert both remain independently alive.
5. **Unit test — `mountInstance` still produces one working instance per call**, unaffected by the refactor (regression coverage for the existing single-instance demos).
6. **Live/manual verification** (no jsdom `ScrollTrigger` in this test suite currently, per existing test file patterns) — run `DemoPage.jsx`'s three scroll scenes and `PasarMalamPage.jsx` in an actual browser, confirm pin/scrub/trigger behavior is visually identical to before migration.
7. **Full suite run** — `npx vitest run`, confirm no existing test relied on `TriggerRefRegistry`/`useMotionTrigger`/`resolveElement` (grep test files for these names first).
8. **Full diff review for scope creep** — `BurstPage.jsx`, `MotorcyclePage.jsx`, `PasarMalamObserverPage.jsx` should show zero changes.

## 7. Files Expected to Change

- `src/engines/Engine.js` — shared helper, `mountWithDelegate`, deleted `unmountInstance`/registry methods
- `src/lib/TriggerDelegate.js` — `ScrollTriggerDelegate.build()` drops `resolveElement`/string branches
- `src/lib/Motion.js` — `init()` drops its parameter
- `src/hooks/useScrollMotion.js` — new
- `src/hooks/useTimeMotion.js` — new
- `src/hooks/useManualMotion.js` — new
- `src/hooks/useMotionTrigger.js` — deleted
- `src/lib/TriggerRefRegistry.js` — deleted
- `src/components/Demo/DemoPage.jsx` — 3 motions migrated
- `src/components/PasarMalam/PasarMalamPage.jsx` — 2 motions migrated
