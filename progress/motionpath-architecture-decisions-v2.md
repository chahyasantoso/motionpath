# MotionPath — Engine Architecture Decisions (v2)

Companion to `motionpath-schema-v2-full.md` (the _what_). This is the _why_.
Mirrors v1's `Engine_Architecture_Decisions.md` structurally, but every claim
here is re-derived from `v2` source (`v2` @ `bcbc46f`), not carried over from
the v1 doc by assumption — several things genuinely changed shape, not just
vocabulary.

---

## 1. Why Two Driver Types, Not One Motion Shape

v1 had one motion shape (`scenario`) with one lifecycle: schema → eager build
→ real GSAP timeline → triggered by scroll or time → subscribed/composed to
the DOM. That lifecycle is correct for anything the _page_ owns the timing
of. It's structurally wrong for anything an _external system_ owns the
timing of — a game loop deciding an enemy's progress every frame, a headless
caller resolving a frame of animation with no DOM at all.

Rather than bolt a "headless" flag onto the existing motion shape (considered
and rejected — flagging a trigger-shaped object as "actually has no trigger"
pushes special-casing into every validator that touches triggers, forever),
v2 introduces `driver.type`, exactly two values:

- **`"timeline"`** — page owns timing. Eagerly built, real ScrollTrigger or
  `.play()`, subscribed via `useMotionSubscriber`, rendered via `domRenderer`.
- **`"delegate"`** — caller owns timing. Never eagerly attached to anything,
  resolved on demand via `resolveMotion(motionId, progress, overrides?)`,
  returns a plain numeric patch the caller applies however it wants.

This is a real fork in _lifecycle_, not a config toggle — which is why it's
modeled as two driver types with mutually exclusive field sets (enforced by
`motion-structure.js`: `trigger`/`sectionId`/`timelineId`/`primary`/`stagger`
are all build-time errors on `delegate`), rather than one motion shape with
optional fields that only sometimes apply.

## 2. Why `buildProject` Filters Delegate Motions Out Entirely

**History, not just current state:** this wasn't the original design.
`buildProject` originally built every motion — `timeline` and `delegate`
alike — into a real GSAP timeline unconditionally, and `ProductionEngine`
separately learned to skip delegate motions during trigger-wiring
(`if (motion.driverType === 'delegate') continue;`). That meant every
delegate track paid full tween-construction cost twice: once for a timeline
nobody would ever mount, play, or query, and once again inside
`resolveMotion`'s own independent, cached build. The eagerly-built copy also
stayed resident in memory for the life of the loaded project.

This was found, fixed, and verified (fresh clone, `228/228` tests) by
filtering `schema.motions` down to non-delegate motions **before**
`buildProject`'s per-motion loop even starts, rather than branching inside
it. The result: `buildResult.motions`/`buildResult.tracks` only ever contain
`timeline`-driver entries, by construction — nothing downstream needs to
know delegate motions exist, because they were never in the working set.
`ProductionEngine`'s old skip-check became dead code by construction and was
deleted, not left in as a defensive no-op.

**One deliberate, accepted tradeoff from this fix:** a malformed delegate
track (bad property key, missing plugin) no longer throws at `loadProject()`
time. It throws the first time `resolveMotion()` actually resolves that
track — still loud, with full `motion "X", track "Y"` context, just deferred
from load time to first use. This was chosen over adding a second,
tween-free structural validation pass for delegate tracks specifically,
because that would be solving a problem (early detection) that hasn't
actually caused an incident, for a schema-authoring style (delegate motions
invoked per-entity, per-frame, immediately exercised in any real usage) where
a broken track is unlikely to hide for long in practice. Revisit only if a
real incident says otherwise.

**Verified structurally safe to remove**, not just assumed: nothing depends
on delegate entries existing in `buildResult`. Validators run on raw
`schema`, pre-build. `EditorEngine.mountTimeline()`/`resolveMotion()` already
throw on the wrong driver type regardless. `destroySection(sectionId)`
filters by `sectionId`, which delegate motions structurally never have.

## 3. Why `resolveMotion` Is Fully Decoupled From `buildResult`

`resolveMotion(schema, motionId, progress, overrides?)` takes the **raw
schema**, not `buildResult` — it re-derives what it needs (`resolveTrack`,
`buildTrackTweenSync`) independently, with its own private cache
(`Map<"${motionId}::${trackId}", {tween, proxy, resolvedPlugins, resolvedTrack}>`).

This is deliberate, not an oversight that happens to be convenient: a
delegate motion's resolution needs no knowledge of ScrollTrigger, no
knowledge of `timelineId` grouping, no knowledge of anything
`buildProject`'s eager pipeline computes for `timeline`-driver motions.
Coupling it to `buildResult` would mean every delegate resolution silently
depends on the _entire_ project having been successfully eager-built first —
true today, but an unnecessary dependency for a code path whose entire
purpose is being usable independently, per-entity, per-frame, potentially at
high call volume.

### 3.1 The Caching Contract, and Why Overrides Bypass It

- **No `overrides`** → tween built once per `(motionId, trackId)` pair,
  cached, paused, reused via `.progress()` on every subsequent call. This is
  what makes calling `resolveMotion` in a tight per-entity-per-frame loop
  viable — 50 enemies sharing one template become 50 `.progress()` calls
  against one cached tween, not 50 tween constructions.
- **`overrides` passed** → cache bypassed entirely, fresh tween built and
  killed immediately after every single call.

This asymmetry is intentional, not a missing optimization. The no-override
case is a **shared** resource — many callers reading the same cached tween,
nobody owns disposal, the engine's own `clearCache()`/`_cleanup()` is the
only thing that ever tears it down. The override case is an **exclusive**
resource — one caller's particular override (a boss's stat block, a
projectile's specific arc), used for exactly as long as that caller's
instance is alive, with no natural way for the engine to know when that is.
A cache keyed by `(motionId, trackId, overrides)` was considered and
rejected: correctly bounding such a cache (evicting stale/one-off override
variants) is real, non-trivial design surface for a benefit that doesn't
exist yet at any tested scale. If override-heavy usage (many concurrent,
long-lived override variants) ever becomes a real bottleneck, the fix on the
table is an explicit caller-owned handle — `create → seek → dispose` — not a
bigger implicit cache, because the caller is the only party that actually
knows an override instance's lifetime; the engine structurally can't.

### 3.2 Why the Return Shape Is Always `Record<trackId, DOMPatch>`

Even a single-track delegate motion returns `{ trackId: patch }`, never a
bare patch. Two alternatives were considered and rejected: a flat return for
single-track motions (would mean adding a second track to an existing motion
later is a breaking API change for every existing caller), and a separate
`resolveTemplateFrame(templateId, progress)` API bypassing `motion` entirely
for the single-track case (would mean two divergent return shapes existing
in the codebase simultaneously, forcing every caller to know which one
they're dealing with). One shape, always keyed by track id, means adding
tracks to a motion later needs zero caller-side restructuring.

## 4. Why Templates Are a Separate Top-Level Construct, Not a Motion Flag

`templates[]` forbids `driver`/`timelineId`/`primary`/`trigger` entirely
(build-time error if present) — templates are pure keyframe fragments, never
independently triggerable. A `resolveTemplateFrame()`-style API resolving
templates directly, bypassing `motion`, was considered (see §3.2) and
rejected for the same reason: it would create a second, divergent way to get
animation data out of the engine, alongside `resolveMotion`. Templates exist
to be _referenced_ (`track.use`), never resolved on their own.

### 4.1 Why the Track+Template Merge Is Whole-Key Replacement, Not Deep Merge

`resolveTrackKeyframes()` (`templateResolver.js`) merges at the
**property-key level** — if a track overriding a template redefines `scale`,
the track's entire `scale.stops` array wins outright, not spliced
stop-by-stop against the template's. This was chosen because a per-stop deep
merge has no unambiguous semantics for keyframe arrays specifically — which
stop in the override corresponds to which stop in the template when their
`p` values don't line up exactly? Whole-key replacement sidesteps that
question entirely: if you're overriding a property, you're authoring its
complete animation, not patching individual points in someone else's.
`duration`/`transformOrigin` are simple scalar fallbacks (`??`) precisely
because they don't have this ambiguity — there's nothing to merge, only to
pick one value or the other.

## 5. Why Filter Properties Are One Consolidated Plugin, Not Four

`blur`/`brightness`/`contrast`/`saturate` are owned by a single
`filterGroupPlugin`, not four separate plugin instances (this was a v1→v2
consolidation, "Brief 10"). Each property still tweens independently through
the normal keyframes mechanism — the consolidation is only in `compose()`,
which merges whichever subset is present into one `{ filter: {...} }` object.
The reason for one plugin rather than four: CSS's `filter` property is a
single string built from _all_ active filter functions together
(`"blur(4px) brightness(1.1)"`), so composing them independently and trying
to merge four separate string fragments after the fact is strictly harder
than owning the merge in one place from the start. This is the general
pattern for any "many schema properties, one CSS output" case, not something
specific to filters — if a future property family has the same shape
(several schema keys collapsing into one platform-specific output), the
right model is the same: one plugin owning the whole family, numeric
internally, string-building only in `compose()`.

## 6. Why `compose()` Stops Short of CSS, and What Owns the Rest

`compose()` — both `engineCore.compose()` (DOM path) and `resolveMotion`'s
compose step — returns a **renderer-agnostic-numeric** patch: plain numbers,
structured objects like `{ filter: { blur: 4 } }`, never a CSS string. CSS
stringification and the actual `gsap.set()` call live in exactly one place:
`src/lib/renderers/domRenderer.js`. `useMotionSubscriber` calls
`domRenderer(target, patch)`; `resolveMotion`'s callers (game loops,
headless code) consume the numeric patch directly and never touch
`domRenderer` at all.

This split exists for one concrete reason: a hypothetical non-DOM renderer
(Flutter's `ImageFilter`/`ColorFilter`, a Canvas/Pixi renderer) needs the
same numeric patch `domRenderer` consumes — it would be a new renderer
function, not a schema change, not a plugin change, not a `compose()`
change. The portability precedent explicitly cited when this was designed:
Lottie ships one JSON schema authored once, with independent native players
per platform each doing their own translation at their own build boundary —
the schema itself doesn't need to know about CSS, Flutter, or anything else.

## 7. Why `composePatch()` Exists as a Separate Module

**History, not just current state:** `engineCore.compose()` and
`resolveMotion.js` each had their own, independently-written loop doing the
same conceptual thing — call every resolved plugin's `compose()`, merge the
contributions into one patch. They were written hours apart during the same
day's v2 work and had already drifted by the time this was caught: the DOM
path silently swallowed a plugin's `compose()` throwing
(`catch { /* ignore */ }`, comment: "Defensive: one broken plugin must not
blank the whole patch"), while `resolveMotion`'s copy threw with context; the
DOM path merged `filter` contributions via flat overwrite, `resolveMotion`'s
copy via key-by-key spread-merge. Neither divergence was a deliberate
decision — `git blame` traced them to two separate, uncoordinated edits.

This was found, fixed, and verified (fresh clone, `228/228` tests, including
a new test specifically proving the DOM path now throws — it previously had
no test that would have caught the old silent-swallow behavior). The fix
extracted the compose-and-merge loop into `src/lib/composePatch.js`, used
identically by both call sites, so the two behaviors (throw-on-error,
merge-not-overwrite on `filter`) can't drift apart again — there's only one
place left to edit.

**What stayed intentionally different between the two call sites, and why:**
`engineCore.compose()` still does a `claimsKey` fallback scan across
`ALL_PLUGINS` before calling `composePatch()` — picking up plugins for keys
present in `rawData` but outside the track's build-time-resolved set.
`resolveMotion` has no equivalent. This is a real difference in what each
caller needs, not leftover drift: the DOM path supports `useMotionSubscriber`'s
`transformFn` argument, which lets a caller mutate raw data (e.g. inject a
key, clamp a value) _after_ the track was built — the fallback scan is what
lets `compose()` still route an unexpected key to the right plugin when that
happens. `resolveMotion`'s `rawData` always comes straight from its own
tween's proxy, with no equivalent injection point, so the set of keys it
ever sees is structurally always a subset of what the track was built with —
the fallback scan would never find anything to do there. Adding it anyway
would cost real per-call overhead (scanning every registered plugin, every
frame, for every entity) for zero benefit, on exactly the hot path where
that overhead matters most.

## 8. Engine Split — Why `builder.js` / `engineCore.js` / Two Drivers

Unchanged in spirit from v1, re-verified in v2:

- **`builder.js`** — schema → plugin resolution → merged tweens/timelines.
  Pure construction, no DOM writes, no ScrollTrigger, no `.play()`.
- **`engineCore.js`** — shared subscribe/compose/destroy surface over
  `builder.js`'s output. Also DOM-free.
- **`compileProject.js`** — the validate → build → wrap-in-EngineCore
  preamble, extracted once both `ProductionEngine` and `EditorEngine` were
  found to be duplicating it verbatim. Explicitly documented in its own
  top-of-file comment as "pure aside from allocating GSAP timeline/proxy
  objects — never touches ScrollTrigger, never calls `.play()`, never
  touches the DOM."
- **`ProductionEngine`** — attaches real `ScrollTrigger`s, calls `.play()`,
  exposes `pauseTimer`/`playTimer`/`enableScroll`/`disableScroll`.
- **`EditorEngine`** — no `ScrollTrigger`, no auto-play, only
  `setProgress()`/`.seek()` calling `.progress()` directly.

`resolveMotion.js`'s extraction (§3, §7) follows the identical pattern one
level down: shared logic factored out from what were, at one point, two
duplicate copies inside `ProductionEngine`/`EditorEngine`, now a single
`createMotionResolver()` factory both engines delegate to.

## 9. What's Deliberately Not Solved Here

Carried forward from v1 and re-confirmed absent from v2 source — not
oversights, explicitly out of scope until a real need justifies the design
cost:

- Responsive/breakpoint schema variants (`gsap.matchMedia()`-equivalent).
- Value/pattern presets (reusable ease curves, reusable `stops` shapes).
- An imperative/event-fired trigger type for cardinality-unknown-at-load-time
  UI cases (toast queues, arbitrary app events). Workaround today: author N
  reusable `time` motions, invoke via `playTimer`.
- Physics/velocity-driven or blend-tree motion — MotionPath is an
  authored-keyframe engine by design, not a state machine.
