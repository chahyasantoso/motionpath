# MotionInstance — Composition API Contract

Scope: `addChild` / `removeChild` / stagger semantics / `reflowSiblings` /
`onChildChange` / trigger-suppression. This is the surface that lets one
`MotionInstance` own child instances nested in its own GSAP timeline (used
today by the carousel demo). Everything else about `MotionInstance` —
`subscribe`, `compose`, playback control — is unchanged and not covered here.

This doc exists because the behavioral guarantees below aren't recoverable by
reading a single call site; several were locked through iterative discussion,
and one drifted silently between files before being caught (`_groupMember`
vs `_suppressDriver`, fixed 2026-07-15). Treat this as the source of truth
for "is this a bug or intended" when touching this code.

---

## 1. `addChild(motionIdOrConfig, config?)` → `MotionInstance`

**Signature is overloaded:**

- `addChild(configObject)` — reuses the parent's own `motionId`.
- `addChild(motionId, configObject?)` — mounts a different motion as the child.

**Guarantees:**

- Synchronous. Returns the fully-constructed child instance immediately —
  never a Promise.
- Throws if called after the parent has been `destroy()`ed.
- The child is immediately pushed into `parent.children` and nested into
  `parent.timeline` via native GSAP nesting (`timeline.add`) before the
  method returns. There is no "pending add" state — unlike removal, addition
  has no async phase.
- `onChildChange` listeners fire synchronously, at the end of this call.
- The child's own `config.parentId` is set to the parent's `id`. This is
  what makes the child suppress its own trigger (see §5) — do not construct
  a would-be child instance without going through `addChild`, or that
  suppression won't happen.

**Stagger delay assignment** — see §2 for the auto/custom distinction:

- If `config.delay` is omitted, the child is **auto-staggered**: its delay
  is computed as `autoIndex * schemaMotion.stagger` (or
  `schemaMotion.driver?.stagger`), where `autoIndex` counts only among
  _other already-added auto children_ — custom-delay siblings do not
  consume a slot in that count.
- If `config.delay` is provided explicitly, the child is **custom**: that
  exact value is used, verbatim, and the child is permanently excluded from
  any future auto-reflow (§3).

---

## 2. Auto vs. custom children — `isAutoStagger`

Every child instance carries `isAutoStagger: boolean`, set once at
construction from `config.isAutoStagger` (which `addChild` derives from
whether `config.delay` was given) and **never changed afterward**. This is
the single source of truth for whether a child participates in automatic
sibling reflow on removal.

- **Auto** (`isAutoStagger: true`, the default): position is a function of
  index among other auto siblings. Participates in reflow.
- **Custom** (`isAutoStagger: false`): position was explicitly assigned by
  the caller and is never touched by this API again, including across
  sibling removals. If you want a custom child's position to change, you
  must call something that explicitly moves it — there is currently no
  built-in "convert to uniform" operation (deliberately not built; add one
  only if a real use case needs it).

**Why this exists:** composing children with mixed auto/custom positioning
(e.g., most cards auto-staggered, one pinned at a fixed offset) is a
supported, intentional pattern — not an edge case to guard against.

---

## 3. `removeChild(child)` → `void`

**Guarantees, in order:**

1. **Synchronous, immediate:** `child` is spliced out of `parent.children`.
   Anything reading `parent.children` right after this call sees the child
   already gone.
2. **Synchronous, immediate:** the reflow target list is computed — every
   _remaining auto_ child gets a new delay via `autoIndex * stagger`, custom
   children are excluded entirely (§2).
3. **Async, not awaited by the caller:** the reflow animation runs (default:
   a `gsap.to` sliding each auto sibling's `startTime` to its new delay; see
   §4 for how this is customized). This is fire-and-forget — `removeChild`
   itself returns `undefined`, not a Promise. There is no way to `await`
   full completion from the call site.
4. **Only after the reflow resolves** (or throws — see below): the child is
   actually detached from the parent's GSAP timeline (`timeline.remove`) and
   `child.destroy()` is called. **This is the only point at which
   `onChildChange` fires for a removal.** If you need to know "the child is
   really gone," listen on `onChildChange` — do not assume it happened
   synchronously after calling `removeChild`.
5. If the reflow throws or rejects, the structural removal (step 4) still
   happens — a broken animation must never leave the timeline in a state
   inconsistent with `parent.children`. The error is logged, not thrown to
   the caller.

**Idempotency:** calling `removeChild` twice on the same child while its
reflow is still in flight is a no-op the second time. Calling it on a child
that isn't currently in `parent.children` (already removed, or never a
child of this parent) is also a no-op.

**Interaction with `destroy()`:** if the parent (or the child itself) is
destroyed while a removal is mid-reflow, the in-flight reflow tween is
killed and the child is destroyed directly — the deferred detach in step 4
never runs, because there's no timeline left to detach from. This is
handled internally; nothing extra needed at call sites.

---

## 4. Customizing the reflow — schema data only, no function injection

There is exactly one reflow implementation (`MotionInstance.#defaultReflow`)
— a `gsap.to` sliding each auto sibling's `startTime` to its new delay. It
is **not** swappable via engine construction. An earlier version of this API
accepted an injected `reflowSiblings` function per engine; it was removed
(unused in practice, and a JS function contradicts the schema-data-owns-the-what
/ engine-owns-the-how portability principle this system otherwise follows —
see `Engine_Architecture_Decisions` §11).

The only customization surface is data, read from
`schemaMotion.staggerTransition`:

```json
"staggerTransition": { "duration": 0.4, "ease": "power3.out" }
```

Falls back to `{ duration: 0.6, ease: 'power2.out' }` when absent.

**If a genuinely different reflow _mechanism_ (not just timing) is ever
needed** — e.g. fade instead of slide, or no animation at all — the
intended direction is a schema-level discriminator (tentatively
`staggerTransition.type`) that `MotionInstance` dispatches on internally,
not a re-introduced function injection point. Not designed yet; flagged as
an open item, not a locked decision.

---

## 5. Trigger suppression — the two reasons an instance doesn't own its own `ScrollTrigger`

`#ownsTrigger(config)` returns `!config.parentId && !config._suppressDriver`.
Two independent flags, two independent reasons, both must be respected by
anything constructing a `MotionInstance` outside of `addChild`/`mountInstance`:

- **`config.parentId`** — set automatically by `addChild`. A composition
  child never owns a `ScrollTrigger`/autoplay; it's driven entirely by
  being nested in the parent's own timeline.
- **`config._suppressDriver`** — set by `ProductionEngine`/`EditorEngine`'s
  `_configForMount` for any motion that's a member of a `timelineId` group
  (schema-level linking, unrelated to runtime composition). Only the
  group's `primary` should own the real trigger.

**These are not interchangeable and there is no reason to ever add a third
flag for a third "don't own a trigger" case** without also updating
`#ownsTrigger` — if you're adding a new way an instance can be non-primary,
this is the one place that must know about it.

---

## 6. Consumer responsibilities (not enforced by this API)

Things `MotionInstance` deliberately does **not** protect you from — the
calling code owns these:

- **Debounce `onChildChange` before calling `ScrollTrigger.refresh()`.**
  Rapid add/remove sequences fire `onChildChange` once per settled
  operation, not batched. Calling `refresh()` on every firing without
  debouncing is wasteful and, if you ever see visual jump return, is the
  first place to check.
- **Don't call `ScrollTrigger.refresh()`, `.disable()`, `.enable()`, or
  `.scroll()` from inside any code path triggered by `addChild`/`removeChild`
  before the structural mutation has settled.** This was tried (see git
  history on the now-deleted "Scroll-Driver Stagger Freeze/Unfreeze" tests)
  and empirically causes a scroll-position jump on scrub-driven parents.
  `onChildChange`'s deferred-until-settled firing (§3) exists specifically
  so consumers have a safe point to call `refresh()` from.
- **Exit animations on a _parent_ instance itself are not covered by any of
  this.** `destroy()` is synchronous and unconditional, by design — it's
  also called from project-swap cleanup paths that require a guaranteed
  synchronous teardown. If you want "children fade out, then the whole
  section unmounts," sequence that at the calling/React layer before
  triggering the actual unmount — do not expect `MotionInstance` to delay
  its own destruction for you.
- **Don't hold a reference to a destroyed instance and call `subscribe()`
  on it later.** It will throw (`tracksMap` is cleared on destroy). Nothing
  currently exposes a public `isDestroyed` getter for consumers to check
  this defensively — open question, not yet decided whether it's worth
  adding.

---

## Explicitly not part of this contract

- Per-track custom reflow (only whole-parent, batched).
- A public "promote a custom child back to auto-stagger" operation.
- Any subclassing of `MotionInstance` for children — a child is a
  relationship (referenced in a parent's `.children[]`), not a distinct
  type, and can itself call `addChild()` to become a parent.
- Async `addChild` / entrance animations gated on completion before the
  child is considered "added." Addition is always immediate.
