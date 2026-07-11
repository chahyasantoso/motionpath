# Spike: Late-Added Timeline Children vs. `ScrollTrigger.refresh()`

**Question this answers:** if a component registers itself (adds a tween to an
already-attached ScrollTrigger's master timeline) *after* `ScrollTrigger.create()`
has already run, does it work correctly with no extra step, silently misbehave,
or require a manual `ScrollTrigger.refresh()` call? This is the hard blocking
dependency for the B2 proposal (lazy `registerInstance()`-driven construction) —
see the Session-4-era discussion for why: under `data-motion-id`'s eager batch
build, this situation can never occur; under B2 it becomes the normal case any
time a component mounts after initial wiring (conditional rendering, route
transitions, lazy children).

**Code under test:** `src/components/Spikes/RefreshSpikePage.jsx`, route
`/spike-refresh`. Raw GSAP + ScrollTrigger only — no MotionPath engine/schema
layers involved, so the result isolates the GSAP-level behavior itself, same
methodology already used to settle the "MotionPathPlugin dropped" decision
(`Engine_Architecture_Decisions.md` §4).

## How to run

```
npm run dev
```
Open `/spike-refresh`. The page has a sticky readout panel, a 300px pinned
section 60vh down containing `box1` (blue), and an event log at the bottom.

## Protocol

1. **Scroll into the pinned section slowly.** Confirm `box1` moves smoothly
   from left to right as you scroll, and `progress` in the readout goes
   `0 → 1` across the pin's scroll range. This is the baseline — box2 doesn't
   exist in the timeline yet.
2. **While scrolled to roughly the middle of the pin (progress ≈ 0.3–0.6),
   click "Add Late Element (box2)".** This appends a second tween to the
   *same* master timeline GSAP already handed to `ScrollTrigger.create()` —
   simulating a `registerInstance()` call arriving after attach. Do **not**
   click "Call ScrollTrigger.refresh()" yet.
3. **Keep scrolling through the rest of the pin without refreshing.** Watch:
   - Does `box2` (red) animate at all, or does it stay frozen at its
     unanimated CSS position?
   - Does `timeline duration` in the readout increase (it should — GSAP's
     timeline model itself should reflect the new child immediately)?
   - Does `ScrollTrigger end` change, or does it stay at its original
     value from step 1 — i.e. does the *scroll distance* still only cover
     the original (shorter) timeline duration, meaning box2's tween gets
     compressed/rushed into whatever scroll range is left, or cut off
     entirely before its tween can complete?
   - Does `progress` reach `1.0` at the same scrollY as before, or does the
     pin's end point (in px) visibly shift under your cursor?
4. **Scroll back up past the pin's start, then back down through it again**
   (still without refreshing). Does behavior differ from the first pass,
   or does GSAP settle into a consistent (if still wrong) mapping?
5. **Click "Call ScrollTrigger.refresh()".** Note in the log:
   - Does `ScrollTrigger end` recompute to a larger value, extending the
     scroll distance to now cover both box1 and box2's combined duration?
   - Is there a visible **jump/snap** in box1 or box2's position at the
     moment refresh is called, given you're likely mid-scroll? (This
     matters independently of whether refresh is "correct" — a visible
     snap during production use would be a real UX problem even if the
     math becomes correct afterward.)
   - Does scrolling through the pin *after* refresh now correctly animate
     both box1 and box2 across the full (now-longer) scroll range, with
     `progress` reaching exactly `1.0` at the new end point?

## What to record below (fill in after running)

- [ ] Does box2 animate at all pre-refresh? Y/N — describe what you saw.
- [ ] Does `ScrollTrigger.end` change automatically on late-add, without
      calling refresh()? Y/N.
- [ ] Post-refresh: does the scroll range correctly extend to cover both
      tweens? Y/N.
- [ ] Is there a visible jump when refresh() is called mid-scroll? Y/N —
      severity (barely noticeable / jarring).
- [ ] Any console errors or GSAP warnings at any step?

## Decision criteria for B2

- **If pre-refresh behavior is silently wrong** (box2 either doesn't
  animate, animates in the wrong scroll range, or the pin's total scroll
  distance doesn't reflect the new content) **and** refresh() fixes it
  cleanly with no visible jump: B2 is viable, but *only* if every late
  `registerInstance()` call is followed by a deliberate, debounced
  `ScrollTrigger.refresh()` — this becomes a required, non-optional part
  of the B2 design, not an edge case to handle later. That refresh call
  also needs to be batched/debounced across multiple late-registering
  siblings mounting in the same tick, or you'd thrash `refresh()` once per
  component.
- **If refresh() itself causes a visible jump mid-scroll:** B2 needs an
  additional mitigation (e.g. only ever refresh before the user has
  scrolled into the affected pin, or freeze/hide late-added elements until
  a refresh has safely occurred) — meaningfully more design work than
  "drop `data-motion-id`, add `registerInstance()`."
- **If behavior is broken in a way refresh() does not fix** (e.g. GSAP
  caches something at `ScrollTrigger.create()` time that a later
  `.refresh()` doesn't recompute): B2 as currently scoped is not viable
  without a materially different wiring strategy — e.g. deferring
  `ScrollTrigger.create()` itself until all expected instances for a group
  have registered (which reintroduces a "how do I know when a group is
  complete" problem of its own, not solved by anything in this repo today).

Fill in the checklist above after running the protocol, then bring it back
before scoping B2 into an actual brief.
