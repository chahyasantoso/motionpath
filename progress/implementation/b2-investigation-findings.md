# B2 Investigation — Findings and Final Decision

Closes out the "B2" question: how (and whether) to remove `data-motion-id`
from the engine. This doc supersedes all earlier B2 mentions
(`registerInstance()`-based detached animations, lazy per-instance
construction). The conclusion is now locked; see Implementation Brief 7 for
the actionable version.

## The question that actually mattered

The original B2 proposal conflated two separate things: (1) how animated
elements get their DOM target, and (2) how trigger-anchor elements
(`trigger`/`startTrigger`/`pin`/`endTrigger`) get resolved. Investigating
both separately dissolved most of the proposal's scope.

## Finding 1 — `data-motion-id` only does one job, and it's a small one

Direct grep across `builder.js`, `ProductionEngine.js`, and
`useMotionSubscriber.js`: `data-motion-id`/`querySelector` is used in
exactly one place — `ProductionEngine.resolveTriggerRef`. `builder.js`
never resolves `element.id` via the DOM at all; it builds a pure proxy
object per element (`gsap.to(proxy, {...})`), zero DOM dependency, per the
proxy-not-DOM invariant. Animated elements already get their DOM target via
`useMotionSubscriber(elementId, ref)` — a plain React ref supplied by the
consuming component, fully decoupled from build time, with
`EngineCore.subscribe()` already replaying current proxy state
synchronously on call so a late-mounting subscriber is caught up for free.

Confirmed against `BurstPage.jsx`: `data-motion-id="strawberry-card"` is
written in JSX but never actually read for that element — it's wired via
`useMotionSubscriber('strawberry-card', ref, transform)` + a plain ref. The
attribute is dead weight there.

**Consequence:** the original B2 proposal's "lazy per-instance proxy/tween
construction via `registerInstance()`" was solving an already-solved
problem. The real, unsolved gap is trigger-anchor resolution only — and
grep across every demo page confirmed every trigger anchor
(`burst-stage`, `pm-stage`, `helix-stage`, `carousel-stage`,
`rocket-track`, etc.) lives in the same top-level component that already
calls `useMotionProject`, never in a nested child.

## Finding 2 — dynamic/lazy timeline mutation is a genuine dead end

A real browser spike was built (`src/components/Spikes/RefreshSpikePage.jsx`,
route `/spike-refresh`, raw GSAP + ScrollTrigger, no engine layers — see
`.agent/refresh-spike-protocol.md`) to test whether appending a tween to an
already-`ScrollTrigger`-attached timeline (simulating a late
`registerInstance()` call) could be made safe.

**Result, verified against captured data:** appending a sibling tween
retroactively rescales every already-registered sibling's proportional
position on the timeline, instantly — before any scroll event, before any
`refresh()` call. A box at 25% progress on a 1-second timeline jumped to
100% complete the instant a second tween extended the timeline to 2
seconds, because `ScrollTrigger` drives playback via
`tl.totalProgress(fraction)`, and `totalProgress` is fraction-of-*current*-
duration by definition — not something `refresh()` can intervene in.
`refresh()` only recomputes duration-*derived* pixel boundaries; this
schema's `trigger.end` is an intentionally fixed, author-declared literal,
never derived from duration, so there was nothing stale for `refresh()` to
fix in the first place.

Two mitigation techniques were analyzed in depth, both with real GSAP
mechanics correctly cited by whoever proposed them, and both rejected for
production use after tracing the actual cost:

**(a) Scale `end` proportionally with duration at a fixed rate.**
Mathematically verified to prevent the jump for growth — elapsed time
`(scrollY − start) / pxPerSecond` is duration-independent when the rate is
held constant. But: it reintroduces a page-wide cascade (every downstream
`ScrollTrigger`'s position shifts and needs its own refresh — a real UX
problem for content the user hasn't scrolled to yet), and it has no answer
for shrinkage — unmounting/unregistering content the user is *currently*
scrolled into has no jump-free solution under any scheme, because you'd be
removing scrollable distance out from under their current position.

**(b) Anchor-based remapping.** Freeze `tl.time()` and the scroll fraction
at the moment of mutation, then manually drive `tl.time()` via
`ScrollTrigger`'s `onUpdate` using the delta from that frozen anchor,
bypassing GSAP's automatic `animation:` binding. Verified to correctly
prevent the jump *and* avoid the page cascade (since `end` never moves).
But: it causes registration-timing-dependent **pacing distortion** for all
content after the mutation point — verified against real numbers that the
local playback rate changes by a factor dependent on exactly when in the
scroll range the late registration happened, which is a runtime accident,
not something any author controls or can predict. It still has no clean
answer for shrinkage of already-visited content, and — since you can't know
in advance which scrub groups will ever receive a late registrant — it
would have to become the *default* wiring for every scrub group, not an
opt-in, making it a permanent complexity tax on `ProductionEngine` rather
than a contained feature.

**General principle that fell out of this analysis:** for a scrub-driven
timeline, exactly one of {visual state, scroll distance, pacing rate} must
absorb a duration change when the timeline is mutated live. There is no
configuration that holds all three fixed simultaneously. Every mitigation
is a choice of which cost to pay, not a way to avoid paying one.

## Decision (locked)

Dynamic/lazy element registration is explicitly out of scope. Timeline and
tween construction stay fully eager — built once, from the complete
schema, exactly as today — and are never mutated after `ScrollTrigger` has
attached. This is a deliberate, informed choice given no current real
product requirement for genuine mid-scroll mount/unmount of animated
content; the actual motivation for B2 was always "stop depending on
`data-motion-id`," not "support dynamically loaded scroll content," and the
scoped-down version below satisfies that motivation without any of the
above hazards.

## Final scope (see Implementation Brief 7 for the actionable spec)

Schema is unchanged. New hook `useMotionTrigger(id, ref)`, symmetric to
`useMotionSubscriber`, registers into a small map inside `ProductionEngine`
independent of the `loadProject`/`destroy` lifecycle. `resolveTriggerRef`
reads from that map instead of querying the DOM. A missing ref at wiring
time throws immediately (no buffering/retry — unlike `subscribe()`'s race,
there's no safe recovery path that doesn't reintroduce either delayed
`ScrollTrigger.create()` or live timeline mutation). `data-motion-id`
disappears from the codebase entirely.

**Documented, not built, extension point:** if a genuine future need
arises for a trigger anchor owned by a component that mounts after
`useMotionProject`'s effect (doesn't exist in current usage — every trigger
anchor today lives in the same component that calls `useMotionProject`),
the extension is to generalize the deferred-call buffer (see
Implementation Brief 9) to also cover trigger-ref registration — deferring
only the *timing of the one-time `ScrollTrigger.create()` call*, never
mutating a timeline after attachment. This does not require revisiting
anything in this document; it's additive.
