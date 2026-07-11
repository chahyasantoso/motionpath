# MotionPath Addendum — Detached Animation Definitions & Instance Registration

Delta only — merge into existing `schema.md` (v1), `Engine Architecture Decisions`, and `Schema Updates — Session 2`. Supersedes the earlier draft `Addendum_DOM_Decoupling_and_Dynamic_Stagger.md` in full — that draft's `repeat` field and `assertMode('single'|'instance')` mechanism are both dropped; see §6 for why.

---

## 0. Problem Statement

Two related gaps were identified:

1. **DOM coupling in engine core.** `sceneId` / `startTrigger` / `endTrigger` / `pin` were resolved via `document.querySelector('[data-motion-id="..."]')` inside the engine. This is real coupling to the browser DOM API specifically — narrower than "coupling to React" — and works against the already-locked cross-engine portability principle (Engine Architecture Decisions §11: per-engine translation at the build boundary, not global DOM queries baked into engine core). Note: `getNaturalValue()` is **not** part of this problem — it no longer exists (2-stop minimum is mandatory), so there is only one DOM-query call site, not two.

2. **No mechanism for dynamic-count element lists.** `elements[]` requires each animated element to be statically declared in JSON. There is no way to express "N instances, N determined at render time" (e.g., pricing cards from `.map()`).

Both are solved by the same underlying shift: **animation definitions become reusable, and DOM references arrive via explicit registration from the presentation layer rather than engine-initiated queries.**

---

## 1. Schema Model — Detached Definitions, Bindings Stay in Schema

**Rejected approach (considered, not used):** fully detaching animation-to-scene association into React (`useMotionInstance(animationId, sceneId, ...)`). This was rejected because it moves the cross-scenario element-uniqueness check (and other schema-time validations) from build-time to component-mount-time — a real regression in when bugs surface, for no corresponding benefit.

**Adopted approach:** animation definitions move to a top-level `animations[]` array, referenced by scenarios via `bindings[]`. The relationship "this animation belongs to this scene" **stays in schema**, fully static and validatable before any component mounts. Only *cardinality* (how many live instances) is left to the presentation layer, because that is genuinely only knowable at render time.

```json
{
  "animations": [
    {
      "animationId": "cardReveal",
      "keyframes": {
        "y": { "stops": [{ "p": 0, "v": 40 }, { "p": 1, "v": 0 }] },
        "opacity": { "stops": [{ "p": 0, "v": 0 }, { "p": 1, "v": 1 }] }
      }
    }
  ],
  "scenarios": [
    {
      "sceneId": "pricingSection",
      "trigger": { "type": "scroll", "scrub": true, "start": "top top", "end": "+=1500" },
      "stagger": 0.1,
      "bindings": [
        { "animationId": "cardReveal" }
      ]
    }
  ]
}
```

- `animations[].animationId` — unique key, referenced by `bindings[].animationId`. Shape of `keyframes` is unchanged from the old `elements[].keyframes`.
- `scenarios[].bindings[]` — replaces `scenarios[].elements[]`. Each binding references an `animationId`; cardinality is not declared here (see §3).
- An `animationId` may be referenced by **at most one** binding schema-wide in v1 (reuse across multiple scenes is a preset-style feature, already noted as explicitly deferred — see `Engine Architecture Decisions §12`). This keeps the cross-scenario-uniqueness check trivial: it's now "does this `animationId` appear in more than one binding," a static scan.

---

## 2. Resolution Mechanism — No `data-motion-id`, No `querySelector`

All DOM references now arrive via explicit registration calls from React hooks. Engine core makes **zero** direct DOM queries.

### 2.1 Trigger elements (`sceneId` / `startTrigger` / `endTrigger` / `pin`)

These ids are **known statically from schema** at `loadProject` time — they don't need inference, unlike instance cardinality. Engine records them as pending requirements: "a node will be registered under id X." The node itself arrives later via:

```js
engine.registerElement(id, domNode)   // called by useMotionTrigger on mount
engine.unregisterElement(id)          // called on unmount
```

Cardinality for trigger ids is always exactly 1 (enforced — see §5). This is a **separate id namespace** from `animationId` (§2.2) — a trigger id is never also an animation binding id, so there is no mode-ambiguity to resolve between them. This removes the need for the `assertMode('single'|'instance')` mechanism proposed in the earlier draft entirely (see §6).

### 2.2 Animation instances (`animationId`)

Cardinality is unknown at schema time — could be 0, 1, or N, depending on how many components mount. Registered via:

```js
const instanceId = engine.registerInstance(animationId)  // called by useMotionInstance on mount
engine.unregisterInstance(instanceId)                     // called on unmount
```

No `sceneId` is passed here — the engine already knows which scene an `animationId` belongs to from the schema binding (§1). `registerInstance` only needs to know *which* animation, not *where*.

---

## 3. Build Timing — What's Eager, What's Lazy

Two independent things used to happen together at `initScene` (schema parse → build all tweens). They're now split:

| Step | When | What happens |
|---|---|---|
| `loadProject(schema)` | Immediately, synchronous | Parse `animations[]` and `scenarios[].bindings[]`. Run all static validation (§5). Create an empty scene timeline per scenario (`gsap.timeline({ paused: true })`), ready to receive children. **No tweens, no proxies, no ScrollTrigger yet.** |
| `registerInstance(animationId)` | Lazy, once per mounted instance | Build **one proxy + one `gsap.to()`** for this instance (reusing the existing `contribute()`/merge pipeline, unchanged), compute stagger offset from a monotonic per-`animationId` counter, add the tween into the owning scenario's timeline at that offset. |
| `registerElement(id, node)` | Lazy, once per trigger id | Attach `ScrollTrigger.create({ animation: sceneTimeline, trigger: node, ...triggerConfig })`. Uses GSAP's documented separation of tween/timeline construction from `ScrollTrigger` construction — the timeline can be built and populated before a `ScrollTrigger` is ever attached to it. |

**Why this split matters:** it means the *existing* per-element tween-build logic (`contribute()` → merge → `gsap.to()`) is untouched — it just moves from "called N times in a loop at `initScene`" to "called once per `registerInstance` call, whenever that happens." Nothing about how a single tween is built changes.

### Monotonic stagger counter

```js
let joinCounter = 0 // per animationId, engine-internal, never reset except by destroyScene

function registerInstance(animationId) {
  const def = animationDefs.get(animationId)
  const scenario = findScenarioByBinding(animationId)  // known from schema
  const index = joinCounter++
  const offset = index * (scenario.stagger ?? 0)

  const proxy = {}
  const tween = gsap.to(proxy, { ...buildMergedKeyframes(def), paused: true })
  getSceneTimeline(scenario.sceneId).add(tween, offset)

  const instanceId = `${animationId}#${index}`
  registerProxy(instanceId, proxy)
  return instanceId
}
```

`destroyScene(sceneId)` resets the counter for every `animationId` bound to that scene — otherwise indices climb indefinitely across remounts (not incorrect, just needlessly unbounded).

**Scope decision (unchanged from earlier draft):** this assumes registration settles shortly after mount, before the scene is meaningfully interacted with — i.e., Case (a). Continuously-dynamic counts (items added/removed mid-playback, Case (b)) remain explicitly deferred (§7).

---

## 4. New Hooks

Three hooks. `useMotionSubscriber` is unchanged.

```tsx
// trigger role — one node, id known from schema (sceneId/startTrigger/endTrigger)
function PricingSection() {
  const ref = useRef<HTMLElement>(null)
  useMotionTrigger("pricingSection", ref)
  return <section ref={ref}><PricingCard /><PricingCard /><PricingCard /></section>
}

// instance role — any number of nodes, one per mount
function PricingCard() {
  const ref = useRef<HTMLDivElement>(null)
  const instanceId = useMotionInstance("cardReveal")  // no sceneId needed — schema already knows
  useMotionSubscriber(instanceId, ref)                // unchanged hook, just fed an instanceId
  return <div ref={ref}>Card</div>
}
```

- `useMotionTrigger(id, ref)` → `registerElement` on mount, `unregisterElement` on unmount.
- `useMotionInstance(animationId)` → `registerInstance` on mount, `unregisterInstance` on unmount. Returns the `instanceId` handle for `useMotionSubscriber`.
- `useMotionSubscriber(id, ref)` → unchanged. Accepts either an `instanceId` or a `sceneId` (§5 below) — same broadcast mechanism either way.

**Known ordering dependency, not independently verified:** React runs child effects before parent effects, so `PricingCard` instances registering before `PricingSection`'s trigger attaches is the expected order in the example above. `getSceneTimeline`/`ScrollTrigger.create` should not assume this — a scene timeline must accept new children added after a `ScrollTrigger` has already attached to it without silently breaking scrub mapping. **Flag for a browser spike:** does attaching more children to a timeline after `ScrollTrigger.create({ animation: timeline, ... })` require an explicit `ScrollTrigger.refresh()` call, or does GSAP handle it automatically? Not assumed either way until tested.

---

## 5. Scene-Level Progress — No New API

Rejected: a separate `subscribeToScene(sceneId, callback)` API. Adopted instead: the scene timeline is broadcast through the **same** `subscribe()` mechanism already used for instances, keyed by `sceneId` instead of `instanceId`.

```js
timeline.eventCallback("onUpdate", () => {
  sceneProgressProxy.progress = timeline.progress()
  broadcast(sceneId, sceneProgressProxy)  // same broadcast fn as instances use
})
```

```tsx
useMotionSubscriber("pricingSection", (raw) => {
  raw.progress // 0–1, raw number, no prefix — consistent with the existing no-`__` convention
})
```

One function, one mental model: give it an id, get raw values back. No second API surface to learn, test, or maintain.

**Namespace note:** `instanceId` always contains `#` (`"cardReveal#0"`); `sceneId` never does. This makes collisions between the two id spaces practically impossible without being formally guaranteed. Cheap fix, added to validation: `sceneId` must not contain `#` (§8).

---

## 6. Why the Earlier Draft's `repeat` Field and `assertMode` Are Dropped

The previous draft proposed either a schema `repeat: boolean` flag, or inferring single-vs-instance mode from which hook was called first (`assertMode`). Both are now unnecessary:

- `repeat` was rejected earlier in this session for creating two sources of truth (schema declaration vs. actual hook usage) that could silently drift.
- `assertMode` is now moot because trigger ids and `animationId`s are **structurally different id spaces** (§2.1 vs §2.2) — a trigger id is never referenced as an `animationId` binding, so there's no ambiguity to resolve between "registered as single" vs "registered as instance." The distinction falls out of the schema shape itself, not a runtime flag or inferred mode.

---

## 7. Explicitly Deferred (not designed, flagged for future)

- **Case (b): continuously-dynamic instance count** (instances added/removed mid-playback, not just varying-but-stable at mount). For looping scenarios, a late instance could compute a phase offset via `(index * stagger) % cycleDuration` and join the running timeline without disturbing existing instances — sketched, not locked. For one-shot scenarios, there is no "current phase" to join — this is a product/UX decision (snap to end state? replay solo? wait for next trigger fire?) not a technical one, and stays out of scope until that decision is made.
- **`animationId` reuse across multiple scenes/bindings** (true preset behavior — one definition, many unrelated scene attachments). Currently constrained to one binding per `animationId`. Revisiting this is a preset-design conversation, already noted as deferred in `Engine Architecture Decisions §12`.
- Re-stagger policy on unmount (does removing an instance shift remaining instances' offsets?) — not addressed. Current design leaves other instances' offsets untouched, which is the safe default, but no "collapse gaps" behavior is planned or needed yet.

---

## 8. Validation Additions / Changes

All of the following are static, schema-time checks (in `loadProject`), **not** runtime/registration-time — this is the direct benefit of keeping bindings in schema (§1):

- `animationId` referenced by more than one `bindings[]` entry across all scenarios → build-time error (replaces the old "cross-scenario element ID uniqueness" rule, same intent, adapted to the new shape).
- `sceneId` must not contain the `#` character (reserved for internal `instanceId` formatting, §5).
- Trigger ids (`sceneId`/`startTrigger`/`endTrigger`/`pin`) must never coincide with any `animationId` in `animations[]` — enforced trivially since they're parsed from different schema sections, but worth an explicit assertion in `loadProject` for a clear error message if someone accidentally reuses a string across both.

Registration-time (runtime) checks:

- `registerElement(id, ...)` called twice for the same trigger id → throw (duplicate trigger registration; unchanged from prior draft's intent, mechanism simplified since mode-tracking is no longer needed).
- `registerElement`/`registerInstance` called with an id not found in the parsed schema (typo, or hook misuse) → throw with the unresolved id name.

---

## 9. Code Status — Not Yet Written

Suggested implementation order:

1. Schema parsing for `animations[]` + `scenarios[].bindings[]`; drop `scenarios[].elements[]`.
2. `loadProject` — static validation pass (§8), empty-timeline-per-scenario construction, no tweens yet.
3. `registerInstance` / `unregisterInstance` — lazy tween/proxy build, monotonic counter, stagger offset insertion into scene timeline.
4. `registerElement` / `unregisterElement` — `ScrollTrigger.create({ animation: sceneTimeline, ... })` attachment.
5. Scene-level progress broadcast via existing `subscribe()`, keyed by `sceneId` (§5).
6. `useMotionTrigger`, `useMotionInstance` hooks. `useMotionSubscriber` unchanged.
7. **Spike required before relying on this in production:** verify whether adding children to a GSAP timeline after `ScrollTrigger.create({ animation: timeline })` has attached requires manual `ScrollTrigger.refresh()`, or is handled automatically. This directly affects whether §4's ordering note is a non-issue or a real bug risk.

### Verification checklist (grep-able)

- [ ] No `document.querySelector` / `document.querySelectorAll` calls anywhere in engine core source.
- [ ] No `data-motion-id` references anywhere in engine core source (fully removed, not just unused).
- [ ] No `repeat` field in schema types/validation (confirms §6 decision).
- [ ] No `assertMode`/mode-tracking logic anywhere (confirms §6 decision).
- [ ] `scenarios[].elements[]` no longer exists in schema types; `scenarios[].bindings[]` does.
- [ ] Cross-scenario `animationId` uniqueness is validated in `loadProject`, before any DOM/registration call — write a test that loads an invalid schema and asserts it throws with zero mounted components.
- [ ] `registerInstance` index is monotonic per `animationId` and never reused after `unregisterInstance`, except after `destroyScene` resets it.
- [ ] Scene-level progress is retrievable via the same `subscribe(sceneId, cb)` call used for instances — no second subscribe-like function exists.
- [ ] `sceneId` containing `#` is rejected at `loadProject` time.
- [ ] Spike result for late-timeline-mutation-after-ScrollTrigger-attach is documented (either "safe, no refresh needed" or "refresh() call added at X").
