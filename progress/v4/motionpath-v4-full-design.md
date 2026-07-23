# MotionPath v4 — Track as First-Class Playhead Owner (Full Design)

Supersedes `motionpath-v4-track-first-class.md` (Phase 1 draft). This is the consolidated design after full review, including the raw/compose split correction and the internal-timeline / naming revisions. Deletes `driver`/`timelineId`/`primary` from v2/v3 entirely — this is a redesign, not a rename pass.

**Review pass fixes (applied after initial consolidation):** `attach()` was missing the single-ownership throw that Decision 13 claimed existed — fixed. `removeChild()` narrated a "deferred disposal" behavior with no code implementing it — corrected to make disposal explicitly the orchestration layer's job, `Track` never calls `unmount()` on its own. `getSnapshot()` called `#interpolationTimeline.targets()[0]`, which isn't a real `Timeline` API (that's `Tween`-only) — fixed to read from an explicit `#proxyState` field. `#resolvedTrack` was initially flagged as a stray undeclared reference and removed — this was itself a mistake, corrected after checking real v3 source: `MotionInstance.compose()` genuinely passes `resolvedTrack` as `composePatch`'s third argument, so the field has been reinstated. `Motion.onComplete()` was missing entirely (real v3 has `MotionInstance.onComplete`, wrapping GSAP's timeline completion event) — added. The `EventBus`/`playOnEvent` mechanism in §5.2 is explicitly flagged as a different shape from v3's real `onChildChange` (global+payload vs. instance-scoped+payload-less), not a straight port — worth a deliberate sign-off, not an assumed equivalence. Real bug found and fixed: `playOnEvent` didn't filter by payload id, so on a global bus every listener for an event name (e.g. `child:spawned`) would fire for every track's spawn anywhere in the app, not just its own — e.g. two independent Zuma chains would cross-trigger each other's entry-pop animations. Fixed by filtering `payload?.id !== track.id` before playing.

**Gap-closing pass (v3-vs-v4 source diff):** three real v3 mechanisms had no v4 equivalent anywhere in this doc — added as §8 (trigger DOM resolution, push-registration via `TriggerRefRegistry`, `Motion` now takes a `resolveElement` dependency), §9 (async lazy-plugin loading — `Track` has no public constructor, only reachable via an async `createTrack()` factory that awaits `ensureLoaded()` first), and §10 (validator pipeline migration — most rules port unchanged, `timeline-group` deleted, `motion-structure` rewritten for the driver-less v4 shape with explicit forbidden-key errors for old `driver`/`timelineId`/`primary`, `element-uniqueness` extended to also cover bare top-level `tracks[]`).

**§7a added:** `anchor`/`applyAnchor`, ported from a separate `Anchor_Points_Addendum.md` doc — consumption-layer-only element positioning (`xPercent`/`yPercent`, applied post-`compose()`), re-pointed at v4's instance-based `Track.subscribe`/`Track.compose` in place of v3's id-keyed engine singleton. Confirmed `switchToTrack` (§5.3) and `autoPlay`/`playOnEvent` are all the same orchestration-layer tier as `applyAnchor` — none are engine internals, all built entirely from `Track`'s already-public surface — clarified explicitly in §2 so this isn't misread from the code's physical location in the doc.

**Sequencing changed to a breaking-change core rewrite:** the phased brief originally built the core alongside PasarMalam's migration in one phase. Changed to Phase 0 (full core rewrite, zero demo touches, old v3 engine code deleted outright rather than kept as a parallel fallback) followed by one demo-migration phase each (Phase 1 PasarMalam, Phase 2 Tower Defense, Phase 3 Spiral) — see §11 for the reasoning (two engines running in parallel would mean two competing track-id registries or duplicated demo code paths, worse than a clean cutover).

**`TriggerDelegate` chosen (supersedes an earlier `TrackGroup`-dispatch draft — see decision trail):** a real gap surfaced — coordinated tracks driven by an external engine (not a real scroll/time trigger) had no home. Two solutions were drafted: (1) split `motions[]` into two runtime classes (`Motion` vs. a triggerless `TrackGroup`) based on whether `trigger` was present; (2) make the trigger mechanism itself pluggable — a `TriggerDelegate` interface, one per trigger type, each owning whatever control surface is actually meaningful for it (`ScrollTriggerDelegate`/`TimeTriggerDelegate` get `play`/`pause`/`seek`/`reverse`/`onComplete`; `ManualTriggerDelegate` gets only `progress(p?)`). **Solution 2 was chosen** — it's more extensible (custom delegates registered via `registerTriggerDelegate()`, no core code touched for e.g. a MIDI-clock or websocket-driven trigger) and every `Motion` stays a single class with one uniform mount/unmount surface; the trade is one extra level of indirection (`motion.trigger.play()` instead of `motion.play()`) for the common scroll/time case, accepted deliberately. `TrackGroup` is retained only as `Motion`'s internal, unexported mount/unmount implementation detail — not separately schema-constructible or externally visible anymore.

---

## 1. Locked Decisions

1. **`Track` owns a playhead.** Single write path for content position: `track.progress(p?)` — no-arg reads, one-arg writes and notifies.
2. **`Track` is a GSAP-compatible accessor target, never a tween itself, never wrapped in a proxy object.** `gsap.to(track, {progress: 1})` works because GSAP duck-types any function-valued property as a combined getter/setter. Constructing a `Track` never creates or assigns a GSAP tween that belongs to it — it may be driven by zero, one, or several different external `gsap.to()` calls across its lifetime, none of which it owns.
3. **`driver` enum is DELETED.** Mounted (`motion.mount(track)`) vs. not is a runtime relationship, not a schema-declared type.
4. **`timelineId`/`primary` grouping is DELETED.** Tracks needing one shared trigger are authored under one `Motion`; GSAP's native `.add()` sequential positioning replaces the old same-type/exactly-one-primary validator.
5. **`trigger.type` selects a pluggable `TriggerDelegate`, resolved via a registry — not a hardcoded branch inside `Motion`.** Every `motions[]` entry always has a `trigger` with a `type` (`"scroll"`, `"time"`, `"manual"`, or any custom type registered via `registerTriggerDelegate()`); `Motion` itself never branches on trigger type internally — it just calls whatever delegate the registry hands back. **Each delegate owns its own control surface** — `ScrollTriggerDelegate`/`TimeTriggerDelegate` expose `play`/`pause`/`seek`/`reverse`/`onComplete` (a real autonomous clock); `ManualTriggerDelegate` exposes only `progress(p?)` (no clock — external code, e.g. a game loop, drives it). This means every method on a given delegate is unconditionally meaningful — no conditionally-inert methods depending on a hidden flag, and no separate runtime class needed for the "externally driven, but coordinated" case (`Motion` + `ManualTriggerDelegate` covers it). Custom delegates (MIDI clock, websocket-driven, etc.) can be added without touching `Motion` or core parsing code at all. See §2.
6. **Composition (`addChild`/`removeChild`) lives on `Track`**, scoped strictly to *coordinated placement* (rank, spawn offset, reflow cascade) — "moving together." Never used for entry/exit or any other relationship.
7. **No `lifecycle`/`playback` schema field, ever.** Self-play, entry, exit are runtime concerns. Schema only ever describes `keyframes`/`use`/`id` — an entry-pop track and ordinary content track are schematically identical, distinguished only by what runtime code does with them.
8. **A track never has more than one active driver at a time.** `Track` itself does not enforce this — it stays dumb, accepts whatever `progress()` calls arrive. Enforcement is the orchestration layer's job (`Motion.mount()` throws if a track is already mounted elsewhere).
9. **`Track` keeps GSAP's raw/compose split**, mirroring the real (grep-verified) `MotionInstance.getCurrentSnapshot()`/`compose()` pattern from v3: `subscribe()` delivers raw proxy state, `compose()` is a separate, explicitly-called step. This was a real correction mid-design — an earlier draft collapsed the two into one pre-composed subscribe path; that was wrong and has been reverted.
10. **`Track`'s internal GSAP timeline (used for interpolation) is private and never nested into any master.** `Motion.mount()` always drives tracks via an external accessor tween — the same uniform mechanism `autoPlay`/`playOnEvent` use — never by nesting the track's own internal timeline directly. Nesting was considered and rejected: it saves one object per mount but creates two possible GSAP touchpoints per track and breaks the single-driving-mechanism property.
11. **Multiple valid patterns for "one track's output depends on another's" — not a single canonical mechanism.** See §5. `attach`/`detach` (merge, both stay active) and switch-instance (replace subscription, one snapshot handoff) solve different shapes of the same category of problem. Pick per case.
12. **Portability claim is scoped narrowly.** Only `Track`'s *public contract* (`progress`, `compose`, `getSnapshot`, `subscribe` — plain data in, plain data out) is engine-agnostic. `Track`'s internals (private GSAP interpolation timeline) are exactly as GSAP-coupled as `MotionInstance` always was — no regression, but no new portability gained there either.
13. **All three cross-track relationships (`_mount`/`#host`, `attach`/`#attachedTo`, `addChild`/`#parent`) enforce single-ownership the same way — bidirectional backreference, throws on conflict rather than silently double-assigning.** `addChild` originally lacked this (only `Motion.mount` and `attach` had it) — fixed mid-design once flagged; a `Track` could otherwise be silently added as a child of two parents at once with no error, corrupting rank/reflow math quietly.

## 2. Object Model

```ts
class Track {
  readonly id: string;

  #interpolationTimeline: gsap.core.Timeline; // PRIVATE, built once from contribute()'s merged output.
                                                 // Pure computation only — never exposed, never nested
                                                 // into any master. See Decision 10 and 12.
  #proxyState: Record<string, number> = {};    // the actual tween target every nested contribute()
                                                 // tween writes onto — Timeline itself has no .targets(),
                                                 // only Tween does, so this must be tracked explicitly.
                                                 // Confirmed against real MotionInstance.trackBuild.proxy.
  #plugins: Plugin[];
  #resolvedTrack: ResolvedTrackConfig;          // needed by composePatch's 3rd arg (context/error messages).
                                                 // Was mistakenly removed in an earlier review pass —
                                                 // confirmed real via v3's compose(trackId, rawData), which
                                                 // passes trackBuild.resolvedTrack the same way.
  #host: Motion | null = null;         // mount relationship — set only via Motion, single active driver
  #attachedTo: Track | null = null;    // merge relationship — set only via attach()
  #attachedChildren: Set<Track> = new Set();
  #parent: Track | null = null;        // moving-together relationship — set only via addChild, single owner
  #children: Map<string, Track> = new Map(); // addChild/removeChild — ranked, "moving together"
  #subscribers: Set<(raw: RawProxyState) => void> = new Set();

  // --- content position: the ONE write path. Raw/compose split mirrors real MotionInstance. ---
  // CONVENTION, NOT ENFORCED: once a track is mounted (isMounted === true), treat progress() as
  // read-only from outside Motion. Drive it via Motion.seek()/play()/pause()/reverse() instead —
  // those cascade correctly through the single accessor tween Motion already owns. Calling
  // progress() directly on a mounted track will "work" (no throw) but fights Motion's own writes
  // on the next tick — whichever wrote most recently wins, every frame, with no error. Not
  // enforced at runtime because doing so would require Motion to drive tracks through an extra
  // delegator object instead of tweening Track directly, which was deliberately avoided (Decision 10).
  progress(p?: Progress): Progress | void {
    if (p === undefined) return this.#interpolationTimeline.progress();
    this.#interpolationTimeline.progress(clamp01(p));   // pure interpolation, not a scheduling object
    this.#notify();
  }

  getSnapshot(): RawProxyState {
    // RAW values (x, y, __blur, etc. + progress) — NOT composed. Matches v3's getCurrentSnapshot exactly.
    // Read from #proxyState directly, NOT via #interpolationTimeline.targets() — Timeline has no
    // .targets() method (that's a Tween-only API); #proxyState is the actual shared tween target.
    return { ...this.#proxyState, progress: this.#interpolationTimeline.progress() };
  }

  compose(rawData?: RawProxyState): DOMPatch {
    const source = rawData ?? this.getSnapshot();
    let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.id}"`);
    for (const child of this.#attachedChildren) {
      patch = mergePatches(patch, child.compose());    // pulled fresh at compose time, never cached
    }
    return patch;
  }

  subscribe(cb: (raw: RawProxyState) => void): UnsubscribeFn {
    if (this.#attachedTo) {
      throw new Error(`Track "${this.id}" is attached to "${this.#attachedTo.id}" — subscribe to the host instead.`);
    }
    this.#subscribers.add(cb);
    cb(this.getSnapshot());   // immediate replay of current raw state, matches v3 subscribe() behavior
    return () => this.#subscribers.delete(cb);
  }

  #notify(): void {
    const snapshot = this.getSnapshot();
    for (const cb of this.#subscribers) cb(snapshot);
  }

  // --- mount lifecycle (Motion only, private — names mirror their public caller) ---
  _mount(host: Motion): void {
    if (this.#host) throw new Error(`Track "${this.id}" already mounted to "${this.#host.id}"`);
    this.#host = host;
  }
  _unmount(): void { this.#host = null; }
  get isMounted(): boolean { return this.#host !== null; }

  // --- cross-track merge: "living together", NOT moving together ---
  attach(host: Track): void {
    if (this.#attachedTo) {
      throw new Error(`Track "${this.id}" already attached to "${this.#attachedTo.id}"`);
    }
    this.#attachedTo = host;
    host.#attachedChildren.add(this);
  }
  detach(host: Track): void {
    this.#attachedTo = null;
    host.#attachedChildren.delete(this);
  }
  get isAttached(): boolean { return this.#attachedTo !== null; }

  // --- composition: "moving together", ranked, reflowed ---
  addChild(child: Track, opts: { stagger: number }): void {
    if (child.#parent) {
      throw new Error(`Track "${child.id}" is already a child of "${child.#parent.id}"`);
    }
    child.#parent = this;
    const spawnOffset = this.#computeSpawnOffset(opts.stagger); // frontmost-live-child derived, never a counter
    this.#children.set(child.id, child);
    if (this.#host) this.#host._mountChild(child, spawnOffset);
    eventBus.emit('child:spawned', { id: child.id, parentId: this.id });
  }
  removeChild(id: string): void {
    const child = this.#children.get(id);
    if (!child) return;
    const rank = this.#rankOf(child);
    this.#children.delete(id);
    child.#parent = null;             // clears backref on logical removal, mirrors _unmount's role
    if (rank > 0) this.#reflow();     // eager synchronous currentDelay write; rank-0 never cascades
    eventBus.emit('child:removing', { id: child.id, parentId: this.id });
    // Track does NOT call this.#host?.unmount(child) here, deliberately — see §4. Logical removal
    // (above) is immediate; if the child has an exit animation, physical disposal (unmount/kill)
    // is the orchestration layer's responsibility, triggered from its own exit-complete callback,
    // NOT baked into Track/removeChild. A child with no exit animation is disposed immediately by
    // the caller right after this call returns.
  }
}

// --- TriggerDelegate: the pluggable trigger mechanism (Solution 2 — chosen over an earlier
// TrackGroup-dispatch draft; see top-of-doc changelog for the decision trail). Each delegate owns
// BOTH how its GSAP timeline is built AND whatever control surface is actually meaningful for it —
// no delegate ends up with a method that's conditionally inert depending on a hidden flag.

interface TriggerDelegate {
  build(resolveElement: (id: string) => Element): gsap.core.Timeline;
}

// Shared, composed (not inherited) implementation for the two delegate kinds that DO have a real
// autonomous clock. Deduplicates the 5 identical forwarding methods without using inheritance,
// matching the project's existing composition-over-inheritance preference for driver architecture.
class AutonomousTimelineControls {
  constructor(private timeline: gsap.core.Timeline) {}
  play(): void { this.timeline.play(); }
  pause(): void { this.timeline.pause(); }
  seek(p: Progress): void { this.timeline.progress(clamp01(p)); }
  reverse(): void { this.timeline.reverse(); }
  onComplete(cb: () => void): void { this.timeline.eventCallback('onComplete', cb); }
}

class ScrollTriggerDelegate implements TriggerDelegate {
  #controls!: AutonomousTimelineControls;
  constructor(private config: ScrollTriggerConfig) {}
  build(resolveElement: (id: string) => Element): gsap.core.Timeline {
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: resolveElement(this.config.trigger),   // §8 — push-registration, never querySelector
        start: this.config.start, end: this.config.end,
        scrub: this.config.scrub, pin: this.config.pin, pinSpacing: this.config.pinSpacing,
        toggleActions: this.config.toggleActions,
      },
    });
    this.#controls = new AutonomousTimelineControls(timeline);
    return timeline;
  }
  play(): void { this.#controls.play(); }
  pause(): void { this.#controls.pause(); }
  seek(p: Progress): void { this.#controls.seek(p); }
  reverse(): void { this.#controls.reverse(); }
  onComplete(cb: () => void): void { this.#controls.onComplete(cb); }
}

class TimeTriggerDelegate implements TriggerDelegate {
  #controls!: AutonomousTimelineControls;
  constructor(private config: TimeTriggerConfig) {}
  build(): gsap.core.Timeline {
    const timeline = gsap.timeline({ repeat: this.config.repeat, yoyo: this.config.yoyo, repeatDelay: this.config.repeatDelay });
    this.#controls = new AutonomousTimelineControls(timeline);
    return timeline;
  }
  play(): void { this.#controls.play(); }
  pause(): void { this.#controls.pause(); }
  seek(p: Progress): void { this.#controls.seek(p); }
  reverse(): void { this.#controls.reverse(); }
  onComplete(cb: () => void): void { this.#controls.onComplete(cb); }
}

// No clock at all — deliberately has ONLY progress(), no play/pause/reverse/onComplete. The
// external engine (game loop, etc.) IS the clock; this is the "coordinated but externally driven"
// case that motivated the whole redesign — a `motions[]` entry with `trigger.type: "manual"`.
class ManualTriggerDelegate implements TriggerDelegate {
  #timeline!: gsap.core.Timeline;
  build(): gsap.core.Timeline {
    this.#timeline = gsap.timeline({ paused: true });
    return this.#timeline;
  }
  progress(p?: Progress): Progress | void {
    if (p === undefined) return this.#timeline.progress();
    this.#timeline.progress(clamp01(p));
  }
}

// Registry — the actual extensibility mechanism. Custom delegates (MIDI clock, websocket-driven,
// video-scrub-synced, etc.) register here; Motion/parseV4Project never need to know they exist.
type TriggerDelegateFactory = (config: Record<string, unknown>) => TriggerDelegate;
const triggerDelegateRegistry = new Map<string, TriggerDelegateFactory>([
  ['scroll', (config) => new ScrollTriggerDelegate(config as ScrollTriggerConfig)],
  ['time', (config) => new TimeTriggerDelegate(config as TimeTriggerConfig)],
  ['manual', () => new ManualTriggerDelegate()],
]);
function registerTriggerDelegate(type: string, factory: TriggerDelegateFactory): void {
  triggerDelegateRegistry.set(type, factory);
}

// Motion is now thin — purely a track-mounting container that HOLDS a delegate. It never branches
// on trigger type, never re-exposes play/pause/seek/reverse/onComplete itself — those live on
// `motion.trigger` (the delegate instance), typed to whichever delegate was actually built.
// Mount/unmount logic is factored into TrackGroup, kept as Motion's internal, unexported detail —
// NOT separately schema-constructible or externally visible (superseded by this delegate design).
class TrackGroup {
  #masterTimeline: gsap.core.Timeline;
  #proxies: Map<string, gsap.core.Tween> = new Map();
  constructor(masterTimeline: gsap.core.Timeline) { this.#masterTimeline = masterTimeline; }
  mount(track: Track, position?: gsap.Position): void {
    track._mount(this);
    const tween = gsap.to(track, { progress: 1, paused: true });
    this.#proxies.set(track.id, tween);
    this.#masterTimeline.add(tween, position);
  }
  unmount(track: Track): void {
    this.#proxies.get(track.id)?.kill();
    this.#proxies.delete(track.id);
    track._unmount();
  }
  _mountChild(child: Track, spawnOffset: number): void { this.mount(child, `>${spawnOffset}`); }
  _unmountChild(child: Track): void { this.unmount(child); }
}

class Motion {
  readonly id: string;
  readonly trigger: TriggerDelegate;   // public — IS the control surface, type tells you what's callable
  #group: TrackGroup;

  constructor(config: { id: string; triggerDelegate: TriggerDelegate }, deps: { resolveElement: (id: string) => Element }) {
    this.id = config.id;
    this.trigger = config.triggerDelegate;
    this.#group = new TrackGroup(this.trigger.build(deps.resolveElement));
  }

  mount(track: Track, position?: gsap.Position): void { this.#group.mount(track, position); }
  unmount(track: Track): void { this.#group.unmount(track); }
  _mountChild(child: Track, spawnOffset: number): void { this.#group._mountChild(child, spawnOffset); }
  _unmountChild(child: Track): void { this.#group._unmountChild(child); }
}

// --- runtime-only helpers, NEVER schema concepts ---
// IMPORTANT: everything below this line is ORCHESTRATION/CONSUMPTION-LAYER, not engine
// internals — same tier as applyAnchor (§7a). Each is built entirely out of Track's already-
// public surface (progress/getSnapshot/compose/subscribe); none reach into private state or
// require Track/Motion to know these helpers exist. They live beside the engine, not inside it —
// placed here for reference alongside the core classes, not because they ARE core classes.

function autoPlay(track: Track, durationSeconds: number, vars?: gsap.TweenVars): gsap.core.Tween {
  return gsap.to(track, { progress: 1, duration: durationSeconds, ...vars });
}

class EventBus {
  #listeners = new Map<string, Set<(payload?: unknown) => void>>();
  on(name: string, cb: (payload?: unknown) => void): UnsubscribeFn {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name)!.add(cb);
    return () => this.#listeners.get(name)?.delete(cb);
  }
  emit(name: string, payload?: unknown): void {
    this.#listeners.get(name)?.forEach(cb => cb(payload));
  }
}
const eventBus = new EventBus();

function playOnEvent(track: Track, eventName: string, vars?: gsap.TweenVars): UnsubscribeFn {
  return eventBus.on(eventName, (payload?: { id?: string }) => {
    // Global bus means every listener for this event name fires on EVERY track's spawn/removal,
    // not just this one's — must filter by payload id or every entry-pop across every chain
    // would replay whenever ANY orb spawns anywhere. Real bug, not a defensive nicety.
    if (payload?.id !== track.id) return;
    gsap.to(track, { progress: 0, duration: 0 });  // reset-on-retrigger is the default
    gsap.to(track, { progress: 1, ...vars });
  });
}

// Switch-instance: replace subscription entirely, one-time frozen snapshot handoff.
// Uses getSnapshot() (raw, read-only) + an explicit one-time compose() at the orchestration
// layer — NOT a mutator on Track. Track gains no new write path for this.
function switchToTrack(
  el: Element,
  fromTrack: Track,
  unsubscribeFrom: UnsubscribeFn,
  toTrack: Track,
  vars?: gsap.TweenVars
): UnsubscribeFn {
  const frozenPosition = fromTrack.compose(fromTrack.getSnapshot()); // one-time, explicit, read-only
  unsubscribeFrom();
  const unsub = toTrack.subscribe(raw => {
    domRenderer(el, mergePatches(frozenPosition, toTrack.compose(raw)));
  });
  gsap.to(toTrack, { progress: 1, ...vars });
  return unsub;
}
```

## 3. Schema Shape

```json
{
  "templates": [ /* unchanged: reusable keyframe fragments, referenced via track.use */ ],
  "motions": [ /* zero or more — only when a trigger is involved */ ],
  "tracks": [ /* zero or more — bare tracks, no trigger, driven manually/by event/by autoPlay */ ]
}
```

Track-ID uniqueness stays **project-wide** across `motions[*].tracks[]` and top-level `tracks[]` — unchanged locked rule from v2/v3.

**No schema field, anywhere, for:** `driver`, `timelineId`, `primary`, `lifecycle`, `playback`, `attach`/`detach`, switch-instance. All of these are runtime-only, established at the point some other code (an `addChild` call, a click handler, an event registration) decides the relationship — never baked into a track's static definition.

### 3a. Scroll-driven (one motion, multiple tracks — replaces old `timelineId`+`primary`)
```json
{
  "motions": [
    {
      "id": "iceCreamSection",
      "trigger": { "type": "scroll", "scrub": true, "pin": true, "start": "top top", "end": "+=2000" },
      "tracks": [
        { "id": "cone", "keyframes": { "y": [{ "p": 0, "v": 0 }, { "p": 1, "v": -40 }] } },
        { "id": "scoop1", "keyframes": { "y": [{ "p": 0, "v": 0 }, { "p": 1, "v": -80 }] } },
        { "id": "sprinkles", "use": "sparkle-template" }
      ]
    }
  ]
}
```

### 3b. Time-driven (`repeat`/`yoyo`/`repeatDelay`/`delay` carry over unchanged — never a grouping concern)
```json
{
  "motions": [
    {
      "id": "toastLoop",
      "trigger": { "type": "time", "duration": 1.2, "repeat": -1, "yoyo": true },
      "tracks": [ { "id": "toastPopup", "keyframes": { "y": [{ "p": 0, "v": 100 }, { "p": 1, "v": 0 }] } } ]
    }
  ]
}
```

### 3c. Manual / externally-driven (replaces `driver:"delegate"` — no Motion at all)
```json
{ "tracks": [
  { "id": "enemy-lane-1", "keyframes": { "path": { "points": [ /* waypoints */ ] } } },
  { "id": "projectile-arc", "keyframes": { "x": [/*...*/], "y": [/*...*/] } }
] }
```
```js
// runtime, per frame:
engine.getTrack('enemy-lane-1').progress(enemy.progress);
```

### 3d. Entry/exit — for contrast, schema-identical to any other track
```json
{ "tracks": [
  { "id": "orb-pop-in", "keyframes": { "scale": [{"p":0,"v":0},{"p":1,"v":1}], "opacity": [{"p":0,"v":0},{"p":1,"v":1}] } },
  { "id": "orb-pop-out", "keyframes": { "scale": [{"p":0,"v":1},{"p":1,"v":0}] } }
] }
```
What makes these "entry" or "exit" is purely which runtime call touches them (§5) — nothing in the JSON marks them as such.

### 3e. Manual-clock group (`trigger.type: "manual"` — coordinated tracks, externally driven, no autonomous clock)
```json
{
  "motions": [
    {
      "id": "waveFormation",
      "trigger": { "type": "manual" },
      "tracks": [
        { "id": "enemyA", "keyframes": { "x": [{"p":0,"v":0},{"p":1,"v":300}] } },
        { "id": "enemyB", "keyframes": { "x": [{"p":0,"v":0},{"p":1,"v":300}] } }
      ]
    }
  ]
}
```
Same `motions[]` array as any other entry, same `Motion` runtime class — `trigger.type` decides which `TriggerDelegate` gets built (§2). A game engine drives the whole group with one number; `Motion.trigger.progress(p)` fans it out to `enemyA`/`enemyB` with their correct relative offsets (GSAP's own `.add()` sequencing, same mechanism scroll/time motions already use):
```js
const formation = engine.getMotion('waveFormation');
formation.trigger.progress(computeGroupProgress());   // per frame — only progress() exists on this delegate
```
Contrast with §3c (bare top-level `tracks[]`, no `Motion` at all) — that case has no relative-offset coordination between tracks, each driven fully independently. Use `trigger.type: "manual"` when tracks need to stay positioned relative to each other but nothing autonomous should drive them; use bare `tracks[]` when they're unrelated to each other.

## 4. Composition — "Moving Together" (`addChild`/`removeChild`)

Relocated from v3's `MotionInstance` to `Track`. Three invariants, hard-won from real async-timing bugs, MUST be re-verified against the new class, not assumed to carry over from a code move:

1. Spawn placement derived from the **current actual position of the frontmost live child** (`max(children.currentDelay) + stagger`), never a counter.
2. Reflow cascade writes `child.currentDelay` **eagerly, synchronously**, the moment a reflow target is decided — never deferred to `onComplete`.
3. Cascade fires **only for rank > 0** removals — rank-0 (closest to completion) never cascades.

**New for v4, not covered by the original three:** logical removal (`#children.delete`, reflow) is immediate and synchronous as before. **`Track.removeChild` deliberately does not call `unmount()` on the removed child** — physical disposal is the orchestration layer's responsibility, not baked into `Track`. If the removed child has an exit animation (§5.3), the caller wires disposal into that animation's completion callback (e.g. `gsap.to(exitTrack, {... onComplete: () => parentMotion.unmount(child)})`); if it has no exit animation, the caller disposes it immediately after `removeChild` returns. A removed child may keep rendering (fading, shrinking) for the duration of its exit animation while already gone from `#children` and uninvolved in further reflow math — that behavior now comes entirely from the orchestration layer choosing when to call `unmount()`, not from any deferral logic inside `Track`.

## 5. Cross-Track Relationships — "Living Together" (co-located, not coordinated)

Never participate in rank or reflow. Two supported patterns — **pick per case, neither is universally correct:**

### 5.1 `attach`/`detach` — merge, both stay active
Right when the attached track should render *simultaneously* with its host — e.g. entry pop-in while the host is still moving into place. Host's compose output and attached track's compose output merge key-by-key (same algorithm `composePatch.js` already uses for filter sub-properties, one level up). `subscribe()` on an attached track throws — it has no independent output, nothing should ever wire a renderer to it directly.

### 5.2 Event mechanism (`EventBus` + `playOnEvent`)
Generic — not entry/exit-specific. Any named event (`child:spawned`, `child:removing`, `hover:enter`, a wave boundary, a click) can drive a track's playhead once via the same accessor tween pattern as everything else. `playOnEvent` resets to 0 before playing by default (retrigger-safe); a fire-once variant is NOT built speculatively — add only when a real case needs it. This closes the previously-backlogged `driver.type:"event"` gap — mark that item resolved.

**Honest comparison to real v3's `MotionInstance.onChildChange(callback)`:** covers similar ground (something in the composition changed) but is a different shape, not a straight port. v3's version is **instance-scoped** (subscribe to one `MotionInstance`'s own children only) and **payload-less** (fires a bare recompute signal). `EventBus` here is **global** (one bus, string-named events) and **carries a payload** (`{id, parentId}`). The global-bus shape is deliberate for v4 — it lets `playOnEvent` attach to a specific spawn/removal by id rather than "something, somewhere changed" — but it's worth someone consciously signing off on trading instance-scoping for a global namespace, since collisions become a real (if unlikely, given project-wide track-id uniqueness) risk if event names aren't namespaced carefully at scale.

`Motion.onComplete(callback)` (§2) separately covers v3's `MotionInstance.onComplete` — GSAP's own timeline completion event, unrelated to the child-composition `EventBus`. This was missing from earlier drafts of this doc and has been added.

### 5.3 Switch-instance — replace subscription, one snapshot handoff
Right when the host track's output should be fully **replaced**, not merged — e.g. click-to-pop exit where the ball freezes and only fades/shrinks, no continued path movement. The outgoing track's current state is read via `getSnapshot()` (raw, read-only) and explicitly composed **once** at the orchestration layer (`switchToTrack`, §2) into a frozen position patch, merged into every subsequent patch the incoming track emits. No mutator is added to `Track` for this — it stays a pure read plus an explicit compose call outside the class. This is real new surface — `attach` never needs it because content keeps running and contributing live; switch-instance is a one-time handoff.

Disposal after a switch-instance exit finishes is the caller's job (per §4's correction) — e.g.:
```js
parent.removeChild(ball.id);                  // logical removal + reflow, immediate
switchToTrack(el, contentTrack, unsub, exitTrack, {
  duration: 0.2,
  onComplete: () => parentMotion.unmount(contentTrack),  // physical disposal, explicit, caller-owned
});
```

### 5.4 Choosing between 5.1 and 5.3
Ask: **does the host track still need to contribute anything (position, etc.) while the overlay plays?** Yes → attach (entry, typically). No, host is done and should stop being computed → switch-instance (exit, typically). Don't force one through the other's mechanism.

## 6. `contribute()`/`compose()` — Unchanged in Purpose, Re-homed

- **`contribute()`** — construction-time, once per `Track`. Resolve owning plugin per `keyframes` key, merge `percentPatch`/`tweenVars` exactly as v2/v3 (ease-collision and tweenVars-collision still throw at this stage, same rules).
- **`compose()`** — explicit, separately-callable step (Decision 9), via unchanged `composePatch.js`. Plugin-level merge (filter sub-properties etc.) unaffected by this redesign.
- **New, one level up:** cross-track merge for `attach`-linked tracks reuses the same key-by-key merge strategy, new call site only, no new algorithm.

## 7. `useMotionSubscriber`/`useMotionSubscribers` — No Structural Changes

Hooks still bind `compose` as a second arg exactly per the original architecture doc's §2 (`transformFn(rawData, compose)`), now against `Track.subscribe`/`Track.compose` instead of `MotionInstance`'s. `attach` is entirely invisible at this layer — the merge happens inside whatever `compose()` call the hook makes, same transparency property `composePatch.js` already had for plugin-level merging. The only new behavior a hook author needs to know: **never point a hook at an attached track** — `subscribe()` throws in that case, failing loudly rather than silently rendering nothing.

## 7a. Anchor (Track Attachment) — ported from `Anchor_Points_Addendum.md`

Consumption-layer only — engine, builder, and schema untouched, exactly as the source doc for this addendum states. Solves: an element attached to a track defaults to positioning by its top-left corner (`x`/`y` applied via `gsap.set`); `anchor` lets an individual attached element say "my center (or any other point) should land here instead," without a custom `transformFn`.

**Where it lives — the `source` entry, re-pointed at v4's instance-based subscribe:**
```js
{ track: engine.getTrack('handJoint'), anchor: { xPercent: -50, yPercent: -50 } }
```

**Applied post-compose, not pre-compose** — same reasoning as the original doc: `path`-driven tracks derive `{x, y, z, rotation}` from `__pathProgress`, never reading raw `x`/`y` off the proxy, so shifting raw values before `compose()` would silently vanish for any path-driven element. `compose()`'s output is the one point in the pipeline guaranteed to mean the same thing regardless of which plugin(s) (or `attach`-merged tracks, §5.1) produced it — that's where anchor operates, unchanged from the original design:

```js
function applyAnchor(patch, anchor) {
  if (!anchor) return patch;   // no default when omitted — a gap resolves to no opinion, not a chosen one
  return { ...patch, ...anchor };
}

// wired into the v4 subscribe path:
track.subscribe(raw => {
  const basePatch = typeof transformFn === 'function'
    ? transformFn(raw, track.compose.bind(track))
    : track.compose(raw);
  const patch = applyAnchor(basePatch, anchor);
  domRenderer(el, patch);
});
```

**Mechanism:** GSAP's `xPercent`/`yPercent` — percentage of the element's own rendered size, computed by GSAP at apply time, no `getBoundingClientRect()` needed. This is also why the earlier width/height `#metrics` question resolved to "not needed" for the path-plugin anchor case — `xPercent`/`yPercent` already lets CSS/GSAP handle the pixel math, same trick this addendum independently arrived at.

**Rejected, same reasoning as the source doc, unchanged for v4:** string presets (`align: 'center'`) — silent-failure risk on typos, no benefit over raw numbers. `offset: { dx, dy }` — no concrete consumer, cut per the `initialPlayStates`-deletion precedent. Default anchor of center when omitted — would silently change every existing element's positioning app-wide the moment this ships; a missing `anchor` must stay a true no-op.

**Open question this redesign surfaces that v3 never had:** `switchToTrack` (§5.3) calls `domRenderer` directly, bypassing the hook layer entirely — so it's currently anchor-unaware. Decision, per Decision 7's "don't build for cases you don't have yet": **`applyAnchor` stays hook-only for now.** If a switch-instance element needs anchoring (e.g. a popped Zuma ball should stay centered on its last path point through the pop), the call site wires `xPercent`/`yPercent` into `switchToTrack`'s merge manually rather than baking anchor support into the helper speculatively. Revisit only if Phase 3 hits a concrete case.

**Testability — unchanged, still a pure function:**
```js
test('merges xPercent/yPercent into patch, no-op when anchor omitted', () => {
  expect(applyAnchor({ x: 100, y: 50 }, { xPercent: -50, yPercent: -50 }))
    .toEqual({ x: 100, y: 50, xPercent: -50, yPercent: -50 });
  expect(applyAnchor({ x: 100, y: 50 }, undefined)).toEqual({ x: 100, y: 50 });
});
```

## 8. Trigger DOM Resolution (found missing in review, addressed here)

Real, load-bearing v3 mechanism this doc omitted entirely until now: how a `trigger`/`startTrigger`/`pin`/`endTrigger` string id in schema resolves to an actual DOM element. **Not related to §7a's `anchor` (element attachment/positioning) — same word, unrelated concepts; "trigger anchor" below refers only to the DOM element a scroll trigger attaches to.** v3 uses push-registration, not `querySelector` — a component registers its ref under an id via `useMotionTrigger`, and the engine resolves against that registry, throwing a clear error if a motion tries to build before its trigger ref is registered:

```js
// v3, unchanged in spirit for v4:
useMotionTrigger(id, ref) {
  useEffect(() => {
    engine.registerTriggerRef(id, ref);
    return () => engine.unregisterTriggerRef(id, ref);
  }, [id, ref]);
}
```

**v4 port:** `Motion` takes a `resolveElement` dependency rather than reaching for a global singleton directly, keeping the class testable without a real DOM/registry:

```ts
class TriggerRefRegistry {
  #refs = new Map<string, React.RefObject<Element>>();
  register(id: string, ref: React.RefObject<Element>): void { this.#refs.set(id, ref); }
  unregister(id: string, ref: React.RefObject<Element>): void {
    if (this.#refs.get(id) === ref) this.#refs.delete(id);
  }
  resolveElement(id: string): Element {
    const ref = this.#refs.get(id);
    if (!ref?.current) {
      throw new Error(`MotionPath: trigger ref '${id}' is not registered. Mount useMotionTrigger('${id}', ref) before this project's motions are built.`);
    }
    return ref.current;
  }
}

class Motion {
  constructor(config: { id: string; triggerDelegate: TriggerDelegate }, deps: { resolveElement: (id: string) => Element }) {
    this.id = config.id;
    this.trigger = config.triggerDelegate;
    this.#group = new TrackGroup(this.trigger.build(deps.resolveElement));   // resolveElement flows into the delegate's own build(), e.g. ScrollTriggerDelegate — see §2
  }
}
```

`useMotionTrigger` itself needs no structural change — only re-pointed at whatever v4 engine/registry singleton replaces `productionEngine`. The ordering contract (`useMotionTrigger` must mount before motions referencing that id are built) carries over unchanged, same throw-with-clear-message behavior as v3.

## 9. Async Plugin Loading (found missing in review, addressed here)

Real gap: `Track` as described in §2 has no explicit constructor, implying synchronous construction from `contribute()`'s output. But v3's `BaseEngine.loadProject()` explicitly awaits lazy plugin loading (`splitText`, `morphSVG`, `drawSVG`, `scrambleText`) before building anything that uses them, and buffers premature calls via `deferredCall` until the core is ready. Building a `Track` synchronously the moment its schema is parsed would break for any track using a lazy plugin whose async import hasn't resolved yet.

**Fix: `Track` has no public constructor at all — only reachable via an async factory.** This keeps `Track` itself simple and synchronous internally (consistent with keeping the class "dumb," per the project's own stated philosophy) while pushing the async concern to the one place it actually needs to live — the boundary where a track is created, whether at initial project load or at runtime spawn time:

```ts
async function createTrack(config: TrackConfig, templates: TemplateMap): Promise<Track> {
  const usedPluginKeys = Object.keys(config.keyframes);
  const lazyPlugins = resolveLazyPlugins(usedPluginKeys);   // splitText, morphSVG, etc. if referenced
  for (const plugin of lazyPlugins) {
    await ensureLoaded(plugin);   // same module-level cached promise pattern as v2/v3 — no double-import
  }
  return new Track(config, templates);   // now safe — constructor stays synchronous, plugins guaranteed ready
}
```

**Where this matters beyond initial load:** `parseV4Project.js` uses `createTrack` for every track in the initial project (`Promise.all` over the full set, same shape as `BaseEngine.loadProject`'s existing await loop — no new pattern, just re-scoped). But it's *also* needed for **runtime-spawned tracks** — e.g. Spiral's `addChild` spawning a new orb from a template that happens to use a lazy plugin — since `deferredCall`'s original job (buffering calls until ready) doesn't apply here at all if construction itself is what's gated. `addChild(child, opts)` as documented in §4 takes an already-constructed `Track` — so the async wait belongs at the *call site* (`const orb = await createTrack(orbTemplate, templates); parent.addChild(orb, {...})`), not inside `addChild` itself, keeping `addChild` synchronous and consistent with the rest of `Track`'s design.

**`motions[]` entry construction (via `TriggerDelegate` registry, §2):** `parseV4Project.js` always constructs exactly one `Motion` per entry — no dispatch to a second class. `trigger.type` selects the delegate from `triggerDelegateRegistry`:
```ts
async function buildMotionEntry(config: MotionEntryConfig, deps): Promise<Motion> {
  const tracks = await Promise.all(config.tracks.map(t => createTrack(t, templates)));
  const factory = triggerDelegateRegistry.get(config.trigger.type);
  if (!factory) {
    throw new Error(`Unknown trigger type "${config.trigger.type}" — register it via registerTriggerDelegate() before parsing.`);
  }
  const motion = new Motion({ id: config.id, triggerDelegate: factory(config.trigger) }, deps);
  tracks.forEach((t, i) => motion.mount(t, i === 0 ? undefined : '>0'));
  return motion;
}
```
The engine registry only ever needs one lookup map, `getMotion(id)` — every `motions[]` entry, trigger type notwithstanding, produces the same class. Callers reach the type-specific control surface via `motion.trigger` (§2, §3e), not via a different top-level accessor.

## 10. Validator Pipeline Migration (found partially missing in review, addressed here)

Real `validateProject()` runs three tiers. Mapping each to v4:

**Unchanged, still run as-is against the new shape:** `ease-collision`, `trigger-shape`, `stagger-shape`, `perspective-usage`, `stop-count`, `stop-shape`, `path-xy-exclusivity`, `path-shape`, `image-sequence`, `schema-version` (bump the version constant for the v4 shape). These are all plugin-tier or keyframe-tier rules that don't care whether they're validating a `MotionInstance`-era schema object or a `Track` config — same rule, same call site, just re-pointed.

**Deleted:** `timeline-group` — validated `timelineId`/`primary` same-type/exactly-one-primary rules, which no longer exist as schema concepts (§1, Decision 4). Remove entirely, don't stub it out.

**Rewritten — real v3 rule, real v4 shape mismatch:** `motion-structure`. v3's version required `driver` (object, `type: 'timeline'|'delegate'`, with delegate-specific forbidden-field checks for `trigger`/`sectionId`/`timelineId`/`primary`/`stagger`). v4 has no `driver` at all — every `Motion` always has exactly one `trigger` (§1, Decision 5). New version should:
- Validate `motions[].id` required + project-unique (was `motionId`).
- Validate `motions[].trigger` is **required** (not `driver`) — every entry needs a `trigger` with a `type`. `trigger.type` must match a key in `triggerDelegateRegistry` (§2) at validation time — NOT a hardcoded `'scroll'|'time'` enum, since custom delegates can be registered by userland code and must validate successfully too. `"manual"` is a built-in type like any other, not a special absence-of-field case.
- Validate `motions[].tracks` and top-level `tracks[]` — both must have ≥1 valid `id` (non-empty string), `use` must reference a real `templateId` if present.
- **Explicitly forbid `driver`/`timelineId`/`primary`/`lifecycle`/`playback` as keys anywhere in the v4 schema** — not silently ignored, a clear migration-guiding error (`"driver" is a v2/v3 field, not valid in v4 — motions always have a trigger, no driver wrapper needed`). This surfaces old-schema authoring mistakes immediately instead of the field being silently dropped and the author wondering why nothing happened.
- Template forbidden-field checks (`driver`/`timelineId`/`primary`/`trigger` forbidden on `templates[]`) carry over unchanged — templates never had these regardless of v3/v4.

**Rewritten — small extension, not a real rewrite:** `element-uniqueness`. v3's version only walked `motions[*].tracks[]`. v4 needs it extended to also walk top-level `tracks[]` (bare, driver-less tracks per §3c), since project-wide uniqueness (§3) now spans both. Same algorithm, same error shape, one more array to walk.

## 11. Implementation Brief — Phased

**Sequencing decision:** v4 is built as **one breaking-change core rewrite (Phase 0), landed and fully verified on its own, before any demo migration begins.** Rejected: incrementally growing v4 alongside a still-running v3 (e.g. building `Track`/`Motion` while `MotionInstance` keeps serving demos). Reasoning: the two engines would either need two separate track-id registries running simultaneously (defeating the project-wide uniqueness guarantee both rely on) or force every demo to carry two parallel code paths during a long transition — worse than a clean cutover, especially since nothing here is in production yet. Demos go from "runs on v3" to "broken, pending migration" the moment Phase 0 lands — that's expected and correct, not a regression to avoid. Each demo then migrates in its own phase, one at a time, against a core that's already fully built and verified.

### Phase 0 — Core System (breaking change, zero demo touches)

Build the entire v4 core in one pass: `Track`/`Motion` classes (§2 — accessor pattern, private interpolation timeline, raw/compose split), `TriggerDelegate` interface + `ScrollTriggerDelegate`/`TimeTriggerDelegate`/`ManualTriggerDelegate` + `triggerDelegateRegistry`/`registerTriggerDelegate()` (§2), `TrackGroup` (internal, unexported), `EventBus`/`playOnEvent`/`autoPlay`/`switchToTrack` (§5, §2), `applyAnchor` (§7a), new `parseV4Project.js` for the `{templates, motions, tracks}` shape, `TriggerRefRegistry` + `Motion`'s `resolveElement` dependency (§8), `createTrack()` async factory + lazy-plugin await (§9), and the rewritten `motion-structure`/extended `element-uniqueness`/all other migrated validators (§10) — all of it, since every piece depends on every other piece and there's no correct partial-core state to hand off to a demo migration.

**Explicit non-goals for this phase — do not do these:**
- Do NOT touch any demo (`PasarMalam`, `TowerDefense`, `Spiral`) in this phase. They stay on v3/broken until their own migration phase — do not attempt to make them "still work" mid-rewrite.
- Do NOT keep `MotionInstance`/`BaseEngine`/`ProductionEngine`/`EditorEngine`/`resolveMotion.js`/`TimelineGroupController`/old `driver`-aware validators (`motion-structure.js`'s v3 version, `timeline-group.js`) running alongside the new core "just in case." **Delete them outright** once the new core's own tests pass — do not leave dead v3 code as an unused fallback; that's exactly the dual-code-path outcome this phased split exists to avoid.
- Do NOT build an adapter/shim translating old `MotionInstance` calls onto the new `Track`/`Motion` API. Demos migrate to the real new API directly in their own phase — a shim layer is throwaway work with its own bug surface, for a transition period this plan is deliberately structured to skip.
- No proxy objects (`{p:0}` + `onUpdate`); no pre-composed subscribe path (must deliver raw, per Decision 9); no nesting of `Track`'s internal timeline into any master (per Decision 10); no `lifecycle`/`playback` schema field; no `querySelector`-based trigger resolution (must use push-registration per §8); no synchronous `Track` construction reachable from outside `createTrack()` (per §9); no string-preset anchors (`align: 'center'`), no `offset`/`dx`/`dy` field, no default anchor value when omitted (per §7a); no hardcoded trigger-type branching inside `Motion` (per Decision 5 — must go through `triggerDelegateRegistry`).

**WRONG:**
```js
const proxy = gsap.to({ p: 0 }, { p: 1, onUpdate() { track.setProgress(this.targets()[0].p); } });
```
```js
subscribe(cb) { this.#subscribers.add(cb); cb(this.compose()); } // pre-composed — wrong, must be raw
```
**CORRECT:**
```js
const tween = gsap.to(track, { progress: 1, paused: true });
masterTimeline.add(tween, position);
```
```js
subscribe(cb) { this.#subscribers.add(cb); cb(this.getSnapshot()); } // raw
```

**Phase 0 is done when:** the full verification checklist below passes on the new core in isolation, with zero dependency on any demo — every check is written against `src/lib/*.js`/`src/validators/*.js` directly, none of them require a demo page to run. Only after this phase's checklist is fully green does any demo migration begin.

### Phase 1 — Migrate PasarMalam onto the finished v4 core

Rewrite PasarMalam's schema to the v4 `{templates, motions, tracks}` shape (§3a-style — tracks nested directly under one `Motion` per section, no more cross-motion `timelineId` linking). Rewrite its hooks to `Track.subscribe`/`Track.compose` (§7) with `applyAnchor` wired in if any element needs non-default positioning (§7a). This phase touches PasarMalam's own files only — the core is already finished and shouldn't need changes; if it does, that's a signal Phase 0 wasn't actually complete.

### Phase 2 — Migrate Tower Defense onto the finished v4 core

Bare `tracks[]` + direct `progress()` calls for unrelated entities, plus `motions[]` entries with `trigger.type: "manual"` (§2, §3e) for any formation/wave that needs tracks positioned relative to each other but driven by the game loop rather than individually — this is the natural first real use case for `ManualTriggerDelegate`, not a hypothetical. **Priority check before declaring done:** confirm `Track` instances are long-lived per game entity (caching win becomes structural/free) vs. re-resolved per call (reintroduces the exact caching bug already fixed once in v2/v3) — write the behavioral spy test for this first, not after.

### Phase 3 — Migrate Spiral/Zuma onto the finished v4 core

Composition move to `Track.addChild`/`removeChild` (§4) plus entry/exit via `attach`+`playOnEvent` (entry, §5.1/5.2) and switch-instance (exit, §5.3). Non-goals: no `lifecycle` schema field, no second public write-path on `Track`, no reuse of `addChild` for entry/exit tracks, no mutator method for snapshot handoff (must stay read-only `getSnapshot()` + explicit external `compose()` call). Treat the three original composition invariants as **re-derivation targets, not ported code** — re-verify with live async GSAP reproduction scripts (real durations, not synchronous stand-ins). New invariant to verify: a mid-chain removal with a real exit-animation duration, with a new sibling spawned *during* that exit window, must place the new spawn using post-reflow state while the exiting sibling remains independently visible and correctly fading.

### Verification checklist

**Phase 0 (core, run before any demo migration begins):**
1. `grep -rn "onUpdate" src/lib/Motion.js src/lib/*.js` → zero matches touching `Track` drivers. Confirms accessor pattern throughout, no proxy objects.
2. `grep -rn "driver\|timelineId\|primary" src/lib/schema/parseV4Project.js` → zero matches.
3. `grep -rn "lifecycle\|playback" src/lib/Track.js` → zero matches. Confirms no schema-adjacent field crept back in.
4. `grep -n "cb(this.compose())" src/lib/Track.js` → zero matches; `grep -n "cb(this.getSnapshot())" src/lib/Track.js` → present. Confirms raw/compose split held (Decision 9).
5. `grep -n "_getGsapTimeline\|masterTimeline.add(track" src/lib/*.js` → zero matches. Confirms internal timeline is never exposed/nested (Decision 10).
6. Behavioral: mount two tracks under one `Motion`, spy `progress()` on both, scrub master at 0/0.5/1, assert values match position on master span.
7. Behavioral: `attach` — merge two tracks' composed patches, assert merged output contains both contributions; assert `subscribe()` on the attached track throws.
8. Behavioral: switch-instance — assert the frozen position patch matches the outgoing track's exact last state, present in every patch the incoming track subsequently emits.
9. Behavioral: `playOnEvent` retrigger — fire the same event twice in quick succession (real timing), assert the track resets to 0 before replaying, not double-accumulating.
10. Behavioral: call `addChild` on the same `Track` from two different parents — assert the second call throws, mirroring `Motion.mount`'s existing double-mount guard.
11. Behavioral: call `attach` on the same `Track` with two different hosts — assert the second call throws (review-pass fix).
12. Behavioral/grep: confirm `Track.removeChild` never calls `unmount`/`_unmount`/`kill` internally — `grep -n "unmount\|kill" src/lib/Track.js` inside the `removeChild` method body should show none; disposal must originate only from caller-supplied completion callbacks (review-pass fix).
13. Behavioral: two independent parent tracks, each with their own `attach`ed entry-pop track, both calling `playOnEvent(entryPop, 'child:spawned')`. Spawn a child on one only — assert the other's entry-pop track does NOT replay (payload-id filtering fix).
14. Behavioral: construct a `Motion` whose trigger references an unregistered id — assert it throws the clear "mount useMotionTrigger before this project's motions are built" message, not a silent failure or a raw `querySelector` null (§8 fix).
15. Behavioral: `createTrack()` on a config using a lazy plugin — assert the returned promise doesn't resolve (and no `Track` is constructed) until `ensureLoaded()` for that plugin resolves; `grep -n "new Track(" src/lib/*.js` → only one call site, inside `createTrack`, never called directly elsewhere (§9 fix).
16. `grep -rn "driver\|timelineId\|primary" src/validators/rules/motion-structure.js` → present only inside the explicit forbidden-key error messages, not as accepted/parsed fields (§10 fix).
17. Unit test (plain Vitest, no async/GSAP needed): `applyAnchor(patch, {xPercent, yPercent})` merges correctly; `applyAnchor(patch, undefined)` returns the patch completely unchanged (§7a fix).
18. `grep -n "config.trigger.type ===\|switch.*trigger" src/lib/Motion.js` → zero matches. Confirms `Motion` never branches on trigger type internally.
19. Behavioral: `registerTriggerDelegate('custom', factory)` with a minimal test delegate, then parse a `motions[]` entry with `trigger.type: "custom"` — assert it builds successfully with zero changes to `Motion`, `parseV4Project.js`, or validator logic.
20. `grep -rln "MotionInstance\|BaseEngine\|ProductionEngine\|EditorEngine\|resolveMotion\|TimelineGroupController" src/` → zero matches anywhere in the tree once Phase 0 is declared done — confirms old v3 code was actually deleted, not left dead alongside the new core.
21. `npx vitest run` on fresh clone — full suite green, core-only (demo tests will be red until their own phase — that's expected at this point, not a blocker).

**Per-demo-migration-phase (repeat for Phase 1/2/3):**
22. Behavioral: mid-chain removal + real exit duration + spawn-during-exit (Phase 3 specific, real async timing) — assert new sibling placement is correct and the exiting sibling remains visible/fading independently.
23. `npx vitest run` on fresh clone — full suite green, including the demo just migrated.
24. Manual visual check for the demo just migrated, unchanged from its pre-migration `v3` visual behavior.
