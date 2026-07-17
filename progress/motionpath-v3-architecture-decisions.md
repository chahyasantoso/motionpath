# MotionPath v3 — Engine Architecture Decisions

The *why* companion to `motionpath-v3-schema-reference.md` (the *what*). Grep-verified against `chahyasantoso/motionpath`, branch `v3`, commit `90dc7b7`. Supersedes the v2-era `Engine_Architecture_Decisions` doc — that doc's `element-uniqueness` section was already known-stale; treat this one as the current source of truth for v3 reasoning.

---

## 1. Why `MotionInstance` became a real class

V3 started as an attempted full functional-programming rewrite: factory functions returning closures over shared mutable state. Architectural review found this wasn't genuinely functional — it was reinventing classes without the benefits (no `#private` field enforcement, forward-reference hacks to work around closures needing to reference each other before they existed).

**Decision:** `MotionInstance` is a real class with `#private` fields. The general rule applied here (and to `ProductionEngine`/`EditorEngine`/`BaseEngine`): reach for a class when you have (a) hidden state that changes output, (b) lifecycle ordering requirements, (c) wrapping an external stateful resource (a GSAP timeline, in this case), or (d) cross-field invariants that must move atomically. All three engine-layer constructs and `MotionInstance` clear this bar. Closures remain the right tool for genuinely stateless transforms (see §6, plugin `contribute()`/`compose()`).

`ProductionEngine` and `EditorEngine` both extend a shared `BaseEngine` and operate uniformly on `MotionInstance` — the earlier "two divergent engine architectures" split (production on `MotionInstance`, editor on an old `BuildProject`/`buildResult` model) is resolved, not deferred.

---

## 2. Destroy lifecycle — from monkey-patching to `onDestroy`

**Original v3 pattern (now removed):** `BaseEngine.mountInstance()` would grab the freshly-constructed instance and reassign its public `destroy` method externally:

```js
// REMOVED — external monkey-patch
const originalDestroy = instance.destroy.bind(instance);
instance.destroy = () => {
  this._instances.delete(instance.id);
  /* ...group cleanup... */
  originalDestroy();
};
```

This works, but it's a module reaching into an object it doesn't own and replacing a public method on it after construction — invisible from the class definition itself, and a second caller doing the same thing would silently clobber the first patch.

**Current pattern:** the engine's cross-cutting cleanup (removing the instance from its own tracking map, tearing down an empty timeline group) is passed in as an `onDestroy` callback inside the construction context, and `CreateMotionInstance.js` calls it *after* the instance's own `destroy()` completes:

```js
const originalDestroy = instance.destroy.bind(instance);
let destroyed = false;
instance.destroy = () => {
  if (destroyed) return;
  destroyed = true;
  originalDestroy();
  if (context?.onDestroy) context.onDestroy(instance);
};
```

This is still technically a wrapper around `destroy`, but the difference matters: it happens once, at construction time, in the factory that owns the object's creation — not from an unrelated module reaching in after the fact. The factory is allowed to decorate its own output before handing it out; a consumer replacing a method on an object it merely received is the pattern being avoided.

**Idempotency is enforced at two independent layers, deliberately:**
- `MotionInstance.destroy()` itself has an early-exit `if (this.#destroyed) return;` guard — protects internal teardown (killing `ScrollTrigger`, timeline, children) from running twice.
- `CreateMotionInstance`'s wrapper has its own `destroyed` flag — protects `context.onDestroy(instance)` from firing twice.

These aren't redundant despite guarding the same method: without the wrapper's own flag, a second `destroy()` call would correctly no-op internally (first guard catches it) but `onDestroy` would still fire again, calling `controller.removeMember()` a second time on an already-removed group member. Two guards, two different things protected.

**Ordering fix inside `destroy()` itself:** the `#onSubscriberChange` notification was moved from the *end* of `destroy()` to immediately after computing `hadActiveSubscribers`, *before* `ScrollTrigger`/timeline/children teardown runs. Rationale (from the code comment): the engine needs to unregister the instance while it's still structurally intact, not after its internals have already been killed.

**`broadcast()` also gained a guard:** `if (this.#destroyed) return;` at the top. Defensive — GSAP's ticker can still fire a broadcast in flight even after logical destruction has been flagged, before `.kill()` fully detaches listeners.

---

## 3. Composition model — `subscribe`/`compose` split, and cross-instance reads

Unchanged core design from v2, still load-bearing in v3: `subscribe(trackId, callback)` broadcasts **raw** proxy values every tick, no composition applied. `compose(trackId, rawData?)` — a **pull**, not a subscription — runs the resolved plugins' `compose()` for that track and returns a DOM-ready patch. If `rawData` is omitted, it defaults to the track's current live proxy snapshot + `timeline.progress()`.

**Why `compose()` accepts an omittable `rawData` matters in practice:** it's what makes cross-instance reads cheap and correct. A component driving a *different* instance's track (e.g. an exit animation) can call `otherInstance.compose('some-track')` with no argument and get that instance's live current state — no subscription needed, no staleness, because nothing paused the original instance's timeline just because nothing is listening to it anymore.

**Two known asymmetries, worth remembering when debugging:**
- `subscribe()` throws if `trackId` doesn't exist on the instance (`subscribe: track "X" not found in instance.`). `compose()` returns `{}` instead of throwing for the same condition. This inconsistency is real, not intentional API design — check `tracksMap` yourself if you need to distinguish "no such track" from "track exists but composed to an empty patch."
- `useMotionSubscriber`'s hook-level `transformFn(rawData, composeFn)` gives you a `composeFn` that is **pre-bound to whatever instance/trackId is currently subscribed** — it's `(data) => instance.compose(trackId, data)` with `instance`/`trackId` closed over at subscription time. It is *not* a general-purpose "compose anything" utility. If a swap happens (see §4), `composeFn` starts pointing at the new instance — it does not, and structurally cannot, reach back to the old one. Reading a different instance's live state requires holding a stable reference to that instance directly (e.g. a component prop that doesn't get swapped) and calling `.compose()` on it explicitly.

---

## 4. Two different patterns for "instance handoff": swap vs. layer

Two distinct needs came up this session, and they call for genuinely different code shapes — conflating them was the source of real confusion mid-session:

**Pattern A — clean handoff (subscription swap).** One instance/track fully replaces another as the thing driving a DOM node's *entire* patch. Implemented by swapping React state (`activeInstance`, `activeTrackId`) that both feed the same `useMotionSubscriber` call. When the state changes, the hook's `useEffect` dependency array changes identity, the old subscription's cleanup unsubscribes, a fresh subscription opens on the new instance/track. From that point, the old instance's ticks have no DOM-facing effect — it becomes headless *for rendering purposes* (see caveat below). Appropriate when the new track should own 100% of the output.

**Pattern B — live composition (cross-instance pull inside a transform).** Two instances' outputs need to blend on the same node simultaneously — e.g. an exit-pop effect that should still track the ball's live path position. Implemented by pulling the companion instance's `compose()` result *inside* the active track's `transformFn`, merged with explicit precedence:

```js
function exitVisualTransform(rawData, composeFn) {
  const positionPatch = instance.compose('ball-track');  // live pull, no rawData arg
  const exitPatch = composeFn(rawData);                   // this track's own output
  return { ...positionPatch, ...exitPatch };               // explicit precedence, in source
}
```

This was chosen over running two *independent* `useMotionSubscriber` subscriptions (one per instance, each writing disjoint CSS properties via `gsap.set`'s partial-patch behavior) specifically because independent subscriptions can't guarantee override order on any property both tracks touch — GSAP tick order across two separate root timelines isn't a design-level guarantee in this codebase. A single merge point with explicit `{...a, ...b}` precedence removes that ambiguity entirely. Two-subscription composition remains a legitimate lighter option **only** when the two sources are known to write fully disjoint properties.

**The headless-instance caveat (a real correction made mid-session):** after a Pattern-A swap, the old instance stops driving the DOM, but calling it "headless" without qualification is inaccurate. It's still a live member of its parent container's `children` array until `removeChild()` explicitly detaches it — and the container's reflow logic (`addChild`'s `frontmostDelay` calculation, see §5) actively reads its `currentDelay` to place *other*, newly-spawned siblings. Three states, not two: driving-DOM-and-counted-for-placement → not-driving-DOM-but-still-counted-for-placement → fully detached after `removeChild`.

---

## 5. `addChild`/`removeChild` composition — the reflow bug hunt

The heaviest real-world exercise of this mechanism in the repo (Spiral/"Zuma" demo). Three layered bugs were found and fixed here, and the fixes generalize into standing rules for any future reflow/placement work.

**Bug 1 — spawn placement drift.** A monotonic counter for "where does the next spawn go" looked correct until `removeChild`'s cascade reflow shifted the *existing* chain — after that, the counter under-spaced new spawns by one stagger-width per prior removal, because it was tracking "how many spawned," not "where things actually are now."

**Fix:** spawn placement must be derived from the current *actual* position of the frontmost live child: `children.reduce((max, c) => Math.max(max, c.currentDelay ?? 0), -stagger) + stagger`. Never a counter, never a fixed formula — always read the live state.

**Bug 2 — stale-read race on `currentDelay`.** `removeChild`'s cascade reflow originally deferred writing `child.currentDelay = delay` until the reflow tween's `onComplete` fired. In practice, spawn interval was *shorter* than reflow tween duration — so a new `addChild` call could read `currentDelay` before the previous reflow had finished, getting a stale pre-cascade value and placing the new spawn one extra stagger-width too far out.

**Fix:** the reflow target's `currentDelay` is now written eagerly and synchronously the moment a reflow target is decided, not deferred to tween completion. The tween still animates the *visual* transition, but the *logical* position of record updates immediately. (This is also exactly the value the duration-0 short-circuit added later reads/writes directly, bypassing tween creation entirely when there's nothing to animate — see §6.)

**Bug 3 — cascading on the wrong rank.** Initially, *any* child removal triggered a cascade reflow of the remaining chain. But removals happen two ways: rank-0 (the frontmost child, closest to natural completion) and rank>0 (an actual mid-chain removal, e.g. a clicked ball). Cascading on every rank-0 completion repositions every survivor's `startTime` earlier, every single time — and once a spawner reaches steady state, completions happen continuously, so this compounds. Eventually a child's `startTime` gets pushed *behind* the parent's actual playhead, which triggers GSAP's instant-complete-on-reposition behavior — an avalanche of simultaneous completions cascading into each other.

**Fix:** the cascade only fires for rank>0 removals. A rank-0 completion is the natural order of things and needs no chain repair; only removing something *out of order* creates a real gap that needs closing.

**Standing methodology rule from this hunt:** all three fixes were verified via fresh clone + hand-built live reproduction scripts using **real async GSAP timing** (small real durations, not synchronous stand-ins). Synthetic tests that manually force `currentDelay` to settle immediately can and did mask the real race in Bug 2 — a test that skips real timing skips the exact condition that caused the bug. This is now a standing verification requirement for any future reflow/placement change, not a one-off.

---

## 6. Duration-zero reflow short-circuit

A leftover Indonesian-language TODO comment in the reflow code (*"kalau duration 0 masih kurang efisien karena masih bikin object tween meskipun langsung resolve"* — "if duration is 0 it's still inefficient because it still creates a tween object even though it resolves immediately") flagged a real, if minor, cost: building a `gsap.to()` tween just to animate *zero* seconds and resolve on the next tick.

**Fix:** when `transition.duration === 0`, skip tween construction entirely — set `child.timeline.startTime(delay)` directly (the same property the tween would have animated to), then force the parent timeline to re-render at its current position (`this.timeline.time(this.timeline.time())`, a standard GSAP idiom for making a direct child mutation take visual effect immediately, since GSAP doesn't auto-relayout on a raw `startTime` write). `child.currentDelay = delay` is written before this branch runs either way, so the eager-write invariant from Bug 2 above holds regardless of which path executes.

---

## 7. `TimelineGroupController.attachDriver` — a dead branch, now reachable

**The bug:** the branch deciding whether a grouped primary needed a real `ScrollTrigger` checked `driver.type === 'gsap-scroll' || driver.type === 'scroll'`. But per the actual v2/v3 schema, `driver.type` is only ever `"timeline"` or `"delegate"` — the scroll-vs-time distinction lives one level down, in `driver.trigger.type`. No schema produced by the current vocabulary could ever satisfy that condition, meaning this branch was very likely dead code for the entire life of the v2/v3 rename — grouped scrub primaries may never have gotten a real `ScrollTrigger` attached through this exact path.

**Fix:** the check now reads `trigger.type === 'scroll'` (with `driver.type === 'gsap-scroll'/'scroll'` kept as legacy fallbacks), and a new test exercises the real v3 shape — `{ driver: { type: 'timeline', trigger: { type: 'scroll', scrub: true } } }` — asserting `ScrollTrigger.create` is actually called with the master timeline as its `animation` target.

**Open verification item, not yet closed:** the test proves the call happens against a mocked `ScrollTrigger`, which proves the branch is now *reachable*, not that scrubbing against real scroll behaves correctly once reached. A live browser check against a real scrub-grouped demo is the outstanding step — this is the same category of risk the Bug 2 reflow race represented: a mocked/synchronous test can confirm code paths execute without confirming real-world timing/behavior is correct.

**Companion fix in `MotionInstance.#setupDriver`:** grouped (non-primary) timeline members previously had their own `repeat`/`yoyo`/`repeatDelay` applied to their own child timeline unconditionally — redundant with, and potentially conflicting against, the master's own loop configuration once nested. Both the repeat/yoyo/repeatDelay configuration *and* the autoplay call are now gated behind `#ownsTrigger(config)` (`!config.parentId && !config._suppressDriver`), which the engine sets to `false` for grouped non-primary members. This matches the architecture as originally specified — "primary's `repeat`/`yoyo`/`repeatDelay` apply to the whole nested group as one loopable unit" — it just wasn't fully enforced in code until now.

---

## 8. Lazy plugins — fail loud, not silent

`splitText`/`morphSVG`/`drawSVG`/`scrambleText` were registered as valid schema keys with no-op `contribute()` stubs — a schema author (or an LLM generating one) could use these keys, pass validation, and get zero actual animation with no error anywhere.

**Fix:** `load()` now rejects and `contribute()` now throws, both with an explicit "not implemented" message. This isn't just a unit-level change — `BaseEngine.loadProject()` already `await`s `ensureLoaded(plugin)` for every resolved plugin during its build pass, so the rejection correctly propagates as a build-time error before any GSAP object is constructed, consistent with the project's standing rule: **validator/build-time rules must throw, never silently strip.** This closes the last remaining "silently allowed" gap noted in the schema reference doc.

---

## 9. `resolveMotion` — dropping signature-sniffing

The resolver used to accept either a raw schema object or a parsed `MotionProject` domain model, distinguishing them at runtime via `schema.motions instanceof Map`. This is exactly the anti-pattern this project has flagged before in implementation review: **runtime type branching where an interface contract could be mechanically enforced instead.**

**Fix:** `resolve(project, ...)` now only accepts the parsed domain model and throws immediately if it doesn't look like one (`typeof project.motions?.get !== 'function'`). Verified safe by checking the one real call site — `BaseEngine.resolveMotion()` already only ever passed `this._project` (set by `parseProjectSchema(schema)` inside `loadProject()`) — so this is a dead-branch removal, not a breaking change to any real caller.

---

## 10. `useMotionInstance` config — mount-time-only, by design

`config` was always read only once, inside the mount effect's closure (`[motionId]` dependency array, deliberately excluding `config`) — but this was an implicit convention, not a documented contract, and nothing warned a caller who assumed changing `config` on rerender would do something.

**Fix:** the initial `config` is now cached in a `useRef` at first render and used for the actual `mountInstance()` call regardless of later rerenders. A dev-only `console.warn` (guarded to fire exactly once) fires if a later render passes a `config` with a different identity than the cached initial one. This doesn't change runtime behavior — it makes an existing implicit rule loud instead of silent, matching the project's general preference for explicit failure over quiet surprises.

---

## 11. Filter consolidation (carried forward from v2, unchanged in v3)

`blur`/`brightness`/`contrast`/`saturate` never write to CSS `filter` directly during tweening — each writes its own raw number through the normal keyframe/proxy mechanism. Only `compose()` (via `filterGroupPlugin`) reads whichever are present and merges them into one `{ filter: { blur, brightness, ... } }` object, merged key-by-key across plugins rather than flat-overwritten. `src/renderers/domRenderer.js` is the only place that ever serializes that into a literal CSS `filter` string via `gsap.set()`. This keeps `compose()`'s output renderer-agnostic — a hypothetical non-DOM renderer (Flutter's `ImageFilter`, a game engine's shader uniform) would consume the same raw numeric object.

---

## 12. Methodology, reaffirmed this session

- **Never trust a summary — implementer's or reviewer's.** Every claim in Perplexity's fix-plan report (six numbered changes) was independently verified against the actual diff and, where behavior mattered, against the calling code that exercises it — not just the new unit tests in isolation. This is the same discipline previously applied to Gemini Flash's output; it applies to any external reviewer/implementer equally.
- **A green test suite proves a branch runs, not that it's correct in the real system.** The `TimelineGroupController` fix is the clearest instance of this: the new mocked test proves the previously-dead branch is now reachable and calls `ScrollTrigger.create` — it does not prove scrubbing behaves correctly against real scroll. Live verification remains an open, explicitly tracked step, not an assumption.
- **Synchronous/mocked timing tests can mask real races.** Restated from the `addChild`/`removeChild` bug hunt (§5) as a standing rule, not a one-off lesson: any future change touching reflow, placement, or cross-instance timing needs a live-timing reproduction script, not just a passing suite.
- **A leftover comment can be a legitimate lead.** The duration-zero short-circuit (§6) came from acting on a TODO left in-code rather than ignoring it as noise — worth continuing to scan for during review passes, the same way DRY violations are actively scanned for rather than only caught incidentally.
