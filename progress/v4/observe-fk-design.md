# MotionPath v4 — Observation & Forward-Kinematic Composition (Design)

**Branch:** `v4`
**Status:** design of record. Option 1 is the shipping target (see `observe-multisource-brief.md`).
Option 2 and the epoch-memo optimization are documented future work — do not implement them
from this doc without a dedicated brief.
**Audience:** maintainers, and the design context behind the Gemini Flash implementation brief.

---

## 1. Why this exists

`Track` has two composition mechanisms today that pull in opposite directions:

- **`attach()`/`detach()`** — fan-**in**. A _host_ pulls each attached child's `compose()` and
  merges it into the host's own output (`#attachedChildren` is a Set). "Living together."
- **`setObserved()`** — fan-**out**, single source. An _observer_ folds one source into its
  own output, applied last. Today it reads `source.getSnapshot()` (raw proxy values) to stay
  cycle-safe. "Moving together / FK."

Two problems:

1. `setObserved` reading `getSnapshot()` cannot express real forward kinematics. `getSnapshot()`
   returns a track's _local, raw_ proxy (`{x, y, rotation, progress}`) — it does **not** reflect
   what that track itself observes. A follower needs the source's **fully-resolved world state**,
   which only `compose()` produces.
2. Two mechanisms for "combine tracks" is one too many. `attach` is single-purpose and single-
   direction; `setObserved` is more general. Collapsing attach into a multi-source `setObserved`
   removes a concept.

**Decision:** delete `attach`/`detach`; make `setObserved` multi-source and fold
`source.compose()` (not `getSnapshot()`). This unlocks branching FK skeletons and n-ary joints.

---

## 2. The recursion problem (and why it's two problems)

Folding `source.compose()` makes `compose()` recursive. A track's `compose()` now walks into
every source it observes, each of which walks into _its_ sources. Two failure modes:

- **Back-edge / cycle** (A observes B, B observes A) → infinite recursion → stack overflow.
- **Repeated node / diamond** (A observes B and C; B and C both observe D) → D is composed
  twice per A-compose; a wide/deep DAG composes exponentially. **No cycle required.**

Any solution must address both. We use two independent mechanisms:

### Option A — re-entrancy guard (ships now)

One private flag per track, `#composing`. On entry set it; on exit clear it in a `finally`.
If `compose()` is re-entered on a track already composing, that call is a cycle back-edge:
return the track's **plugin-only patch from its raw snapshot** instead of recursing.

```js
compose(rawData) {
  if (this.#composing) {
    // Cycle back-edge. Never recurse — return our own local (plugin-only) patch.
    const src = rawData ?? this.getSnapshot();
    return composePatch(this.#plugins, src, this.#resolvedTrack, `track "${this.#id}"`);
  }
  this.#composing = true;
  try {
    // full body: plugins + fold each observed source's compose()
  } finally {
    this.#composing = false;
  }
}
```

Why the fallback value is correct: the back-edge is the one place where full resolution is
impossible — resolving it _is_ the work in progress. Returning the track's local contribution
means "use A's own value, not A's B-influenced value." A cycle in _forward_ kinematics is
physically meaningless (that's a constraint/IK solver's job), so degrading the cycle-closing
edge to local state is the honest answer.

Tradeoff: the result is **order-dependent**. Whoever is entered first in a given `compose()`
gets full resolution; the back-edge gets the raw value. Deterministic per call, but asymmetric.
Cost: one boolean, zero allocation. This is what ships.

### Option C — epoch memo (future work, DO NOT ship without its own brief)

Option A stops the crash but not the diamond blowup — a shared ancestor recomposes once per
observer per frame. To make `compose()` run at most once per track per frame, cache the result
under a per-frame epoch.

The natural epoch is **`gsap.ticker.frame`** — a monotonic integer GSAP already maintains, so
no orchestration wiring is needed (and it sidesteps this environment's `Date.now()`/
`Math.random()` unavailability, since it's an integer GSAP owns).

```js
const epoch = gsap.ticker.frame;
if (this.#cacheEpoch === epoch) return this.#cachedPatch; // hit
// ... compute, then:
this.#cachedPatch = patch;
this.#cacheEpoch = epoch;
```

**Why this is NOT in the shipping brief — the correctness caveat:** the epoch cache is only
valid if the track's inputs are constant within a frame. They are **not** under imperative use:
`progress()` can be called many times between ticker frames (scrubbing, `seek`, and every
synchronous test). Two `progress()`+`compose()` pairs in the same frame would return the first,
stale result. So Option C additionally requires **cache invalidation on every local-state
mutation** — reset `#cacheEpoch = -1` inside `progress()` (and on `setObserved`/`removeObserved`).
Miss that and you get stale-frame render bugs that a quick test won't surface. This is a real
but subtle optimization; give it its own brief and its own tests (specifically: imperative
double-`progress()` within one frame must recompose).

The render path makes C worthwhile: subscriptions are push-based and per-track (a track notifies
its own subscribers on its own tween's tick — see `useMotionSubscribers.js`), so there is no
central per-tick barrier and a shared source genuinely does recompose per observer today.

### Why both eventually

- A alone: correct, but O(observers) on shared ancestors. Fine for shallow chains, wasteful for
  a real skeleton with many bones observing a shared root.
- C alone: impossible — its in-progress marker _is_ A's guard. "C" is really "A + memo".
- Together: A guarantees termination; C makes each track compose at most once per frame.

---

## 3. Multi-source `setObserved`

`#observed` becomes a **Map keyed by source Track → mapFn** (insertion order = fold order):

```js
#observed = new Map();

setObserved(track, mapFn) {
  if (!track) { this.#observed.clear(); return; }  // setObserved(null) clears ALL
  this.#observed.set(track, mapFn ?? null);        // add or replace one source
}

removeObserved(track) { this.#observed.delete(track); }

get observedSources() { return Array.from(this.#observed.keys()); }
```

Fold order in `compose()`: base plugin patch first, then each observed source's mapped patch
in insertion order, each `mergePatches`'d on top (last wins). This subsumes `attach`'s many→one
merge (a host "observes" each child) and gives n-ary FK joints (a bone driven by several parents).

**Critical semantic change:** the `mapFn` now receives the observed track's **composed patch**
(`source.compose()` → `{x, y, rotation, …}`), _not_ its raw snapshot. This is the point — the
follower reads resolved world state. mapFns must read composed fields accordingly.

---

## 4. Forward kinematics — the shared math

FK = each joint's world transform is its parent's world transform composed with the joint's own
local transform. The 2D affine accumulation is identical in both options:

```js
// fkMath.js — 2D affine world-transform accumulation
export function composeWorld(parentWorld, local) {
  // parentWorld / local: { x, y, rotation } — rotation in degrees
  const rad = (parentWorld.rotation * Math.PI) / 180;
  const cos = Math.cos(rad),
    sin = Math.sin(rad);
  return {
    x: parentWorld.x + (local.x * cos - local.y * sin),
    y: parentWorld.y + (local.x * sin + local.y * cos),
    rotation: parentWorld.rotation + local.rotation,
  };
}
```

Note on the rendering pipeline: plugins emit **semantic fields** (`{x, y, rotation}`), never
CSS strings. `domRenderer` hands the patch to `gsap.set`, which composes the final CSS transform.
So FK never builds `translate3d(...)` by hand — it only needs to produce the accumulated
`{x, y, rotation}`. `pathPlugin` is the existing proof that geometry can live in `compose()`.

`gsap.set(el, {x, y, rotation})` composes the transform **relative to that one element** — it
does not accumulate a parent's matrix. So the parent→child accumulation must happen **before** the
leaf's `{x, y, rotation}` reaches `domRenderer`. That is what `composeWorld`, folded up the chain,
does. Where it lives is the difference between the two options.

---

## 5. Option 1 — accumulation in the `mapFn` (ships now)

Each joint is a plain `Track`. FK is expressed per edge at wire-up. The `mapFn` receives the
parent's already-resolved world patch and stacks this joint's local transform on top.

```js
import { composeWorld } from "../lib/fkMath.js";

// Each joint's own keyframes animate its local rotation (+ optionally boneLength).
// forearm.getSnapshot() → { rotation, boneLength, progress }

upperArm.setObserved(shoulder, (parentWorld) =>
  composeWorld(parentWorld, {
    x: shoulder.getSnapshot().boneLength ?? 0,
    y: 0,
    rotation: 0,
  }),
);

forearm.setObserved(upperArm, (parentWorld) =>
  composeWorld(parentWorld, {
    x: forearm.getSnapshot().boneLength ?? 0,
    y: 0,
    rotation: 0,
  }),
);

hand.setObserved(forearm, (parentWorld) =>
  composeWorld(parentWorld, {
    x: hand.getSnapshot().boneLength ?? 0,
    y: 0,
    rotation: 0,
  }),
);

// A DOM element subscribes to the tip. compose() walks the whole chain.
useMotionSubscribers([{ track: hand }], ref);
```

`hand.compose()` folds `forearm.compose()` → folds `upperArm.compose()` → folds
`shoulder.compose()`, each `composeWorld` stacking one frame. Final `{x, y, rotation}` →
`domRenderer` → `gsap.set`.

- **Pros:** zero new abstractions; fits the current fold order exactly (fold applies last = "resolve
  parent, then stack me"); n-ary joints are natural (two `setObserved` entries, blend in the fold).
- **Cons:** the math is inline per edge; each mapFn reads `local` from its own `getSnapshot()`,
  a small closure-over-self quirk.

---

## 6. Option 2 — accumulation in an FK plugin (future, cleaner call sites)

Model on `pathPlugin`: the plugin's `compose()` does the geometry; the parent's world state
arrives as a field in `rawData`; the `mapFn` shrinks to a pass-through that names the parent field.

```js
// fkPlugin.js — geometry inside compose(), like pathPlugin
export const fkPlugin = createAnimationPlugin({
  keys: ["boneLength"],
  lazy: false,
  claimsKey: (k) => k === "boneLength" || k === "parentWorld",
  contribute(propKey, stops) {
    const percentPatch = {};
    stops.forEach((s) => {
      percentPatch[`${s.p * 100}%`] = { boneLength: s.v };
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    const parentWorld = rawData.parentWorld ?? { x: 0, y: 0, rotation: 0 }; // no parent → root
    const local = { x: rawData.boneLength ?? 0, y: 0, rotation: 0 };
    return composeWorld(parentWorld, local); // → { x, y, rotation }
  },
});
```

Wire-up is uniform and thin — every edge is the _same_ mapFn, no math at the call site:

```js
const asParent = (pw) => ({
  parentWorld: { x: pw.x ?? 0, y: pw.y ?? 0, rotation: pw.rotation ?? 0 },
});
upperArm.setObserved(shoulder, asParent);
forearm.setObserved(upperArm, asParent);
hand.setObserved(forearm, asParent);
```

- **Pros:** cleanest call sites; math is written once and reusable; declarative.
- **Cons / blocker:** the current fold applies the observed patch **last, overriding** the base.
  But the plugin needs `parentWorld` as an **input** — present _before_ the plugin runs, not merged
  after. So Option 2 requires reordering `compose()` so the observed fold lands in `rawData`
  _before_ `composePatch` runs (or a frame-scoped field the next `compose()` reads). That's a real
  structural change to `compose()`, not just a new plugin — hence "future work with its own brief."

### The anchor connection

Today `anchor` is `{xPercent, yPercent}` — a **self-relative** visual centering applied at the
render layer, _after_ `compose()` (`applyAnchor` in `helpers.js`). It cannot propagate through
folds because it lives post-compose.

There are two distinct offset ideas here. They live at **different layers**, do **different
geometry**, and must **not share the `anchor.offset` field** — overloading one field with a
render-space meaning and a parent-space meaning double-applies the offset for any joint that uses
both. Decision: **(a) is the anchor feature; (b) is not.**

- **(a) Local pixel-offset anchor → pivot/hinge. SHIP NOW, on `anchor.offset`.**
  A render-layer nudge: `finalX = composedX + offset.x`, applied once, post-compose, in the
  element's own screen space (`applyAnchor`). Lets rotation happen around a displaced point — a
  hinge, a pendulum pivot, a clock hand, an off-center grip. Zero FK dependency, no `compose()`
  reorder needed. This is the _only_ meaning `anchor.offset` carries. Implemented in the
  FK-plugin brief, Step 5.

- **(b) Declarative bone rest-offset → the FK bone vector. DEFER, and NOT on `anchor.offset`.**
  In `composeWorld`, `local.x = boneLength` already _is_ the attachment offset in the parent's
  frame — `fkPlugin` consumes it today as an animatable `boneLength` key. So (b) is not a new
  capability; it only buys _ergonomics for fixed-length bones_: letting a joint declare a static
  rest offset instead of writing a 1-stop `boneLength` keyframe. That value is small and
  conditional (needs Option 2's reorder shipped, needs non-animating bone length, needs you to
  actually want it declarative).

  When/if (b) is built, give it its **own field in the plugin's domain** (e.g. a `restOffset`
  the `fkPlugin` reads, or just keep using `boneLength`) — **never** `anchor.offset`. That keeps
  the render-layer field (a) and the compose-layer field (b) from ever colliding, and it means
  (b) doesn't depend on the anchor system at all: it degenerates to "make `boneLength` optionally
  static," a much smaller change than routing it through `anchor`.

---

## 7. Case study — the Spiral (Zuma) entry/exit, under observe

The Spiral demo spawns balls that travel a path, with a scale/opacity **entrance** overlay at
spawn and a scale/opacity **exit** overlay on pop. The current implementation is v3 machinery
(multiple `MotionInstance`s, variable-length `sources`, arity-branching `mergeFn`, and
resubscription when the active instance swaps). Observe replaces the _composition_ half cleanly.

The key insight: entrance/exit are **additive overlays** on the path-following base — the ball
keeps spiraling (base gives x/y) while scale/opacity are layered on top. That is exactly
fold-applied-last:

```js
// Spawn: ball follows the path; entrance overlays scale/opacity.
ballTrack.setObserved(entranceTrack, (snap) => ({
  scale: snap.scale,
  opacity: snap.opacity,
}));
entranceTrack.play();
entranceTrack.onComplete(() => {
  ballTrack.removeObserved(entranceTrack); // caller clears BEFORE destroying the source
  entranceTrack.destroy();
});

// Exit: same wire, different overlay.
ballTrack.setObserved(exitTrack, (snap) => ({
  scale: snap.scale,
  opacity: snap.opacity,
}));
exitTrack.play();
exitTrack.onComplete(() => removeChild(ball)); // ball + its observe refs die together
```

The DOM element subscribes to **one track for its whole life** (the ball track). Wins over v3:

1. No variable-length `sources`, no `mergeFn` arity branch.
2. No mid-animation resubscription — the subscription is stable; only an internal fold pointer
   changes. (v3 tears down and rebuilds the subscription at the exact moment a ball starts
   exiting, because the sources signature changes.)
3. `setObserved` replace-without-throw is designed for the entrance→active→exit swap.

**What observe does NOT replace:** the lifecycle state machine — spawn cadence, `addChild`/
`removeChild` (stagger + reflow, a separate `LayoutDelegate` axis), `play()`/`onComplete`
sequencing, the wave reset. Observe is a **composition primitive, not a state machine**: it
answers "what does this ball render right now," not "when does it spawn/exit." The controller
stays the single owner of lifecycle.

**Sharp edge (the one thing a weaker model will get wrong):** the caller must clear the
observation **before** the observed source is destroyed. Exit-complete removes the whole ball, so
its dangling ref dies with it (no explicit clear needed). Entrance-complete leaves the ball
alive, so you **must** `removeObserved(entranceTrack)` before `entranceTrack.destroy()`, or the
ball holds a reference to a destroyed track and calls `compose()` on it next tick.

No cycle risk here — ball observes overlay, overlay never observes ball (acyclic). The Option A
guard isn't even exercised; it's just harmless insurance.

---

## 8. Summary of decisions

| Decision                 | Now (Option 1)                 | Later (Option 2)                           |
| ------------------------ | ------------------------------ | ------------------------------------------ |
| `setObserved`            | multi-source, Map-keyed        | unchanged                                  |
| Fold reads               | `source.compose()`             | `source.compose()`                         |
| mapFn receives           | composed patch                 | composed patch                             |
| FK math (`composeWorld`) | in each mapFn                  | in `fkPlugin.compose()`                    |
| Cycle safety             | Option A guard                 | Option A guard                             |
| Diamond perf             | accepted (O(observers))        | add Option C epoch memo (own brief)        |
| `compose()` fold order   | last-wins (unchanged)          | reorder: observed → rawData before plugins |
| Offset anchor            | self-relative only (unchanged) | parent-frame `anchor.offset` = bone vector |
| `attach`/`detach`        | **deleted**                    | —                                          |
