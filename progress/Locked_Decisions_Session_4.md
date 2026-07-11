# MotionPath — Locked Decisions, Session 4

Three items. All are fix-notes against already-implemented work (`element-uniqueness` rule, `image-sequence` rule) — not new briefs. Found during architectural review of the image-sequence, play-state, and Pasar Malam additions built after Session 3. Scope is deliberately kept to the smallest file set per item; do not let any of them bleed into unrelated files.

---

## 1. Validator — Fix Note: Element ID Uniqueness Must Be Project-Wide, Not Per-`sceneId`

**Problem:** the current `element-uniqueness` rule only flags a duplicate element `id` when it appears in two scenarios that share the same `sceneId`. But the builder's `elements` map is a single **flat, project-wide** map keyed purely by `id` — a scenario's element registration silently overwrites any earlier scenario's registration of the same `id`, regardless of `sceneId`. This is not a hypothetical: it is exactly the bug documented in `.agent/lantern-animation-composition.md` (Finding 1), where a scroll-scrub scenario and a time-loop scenario — different `sceneId`s — both targeted `lantern-1`, silently discarding the scroll-scrub tween and permanently stalling progress at `0`.

The bug was worked around at the **authoring level** (the wrapper/inner DOM pattern — target `lantern-1-wrap` for scroll, `lantern-1` for time). That workaround is correct and should stay as the recommended pattern. But nothing currently stops the same collision from being reintroduced by any future schema — human or AI-authored — since the validator's uniqueness check doesn't match the builder's actual invariant. This is precisely the "runs but silently does the wrong thing" failure class this project has repeatedly closed off everywhere else (`endTrigger`-forbidden-on-non-scrub, `duration`-forbidden-on-scrub, non-primary-field-forbidden-in-groups, etc.) — it just hadn't been closed here.

### Decision

Change `element-uniqueness` from a per-`sceneId` check to a **project-wide** check: any element `id` appearing in more than one scenario anywhere in the project — regardless of `sceneId` — is a build-time error. There is no legitimate case where two scenarios should target the same element `id`; the flat map means it is always a silent-collision bug, never an intentional pattern. (The wrapper/inner pattern exists precisely so authors never need to do this.)

This is a **behavior change**, not an additive rule: the existing test `"should pass when the same element ID is used across different sceneId values"` currently encodes the old, too-narrow invariant and must be updated to assert an error instead.

### Fix

1. Remove the `sceneId`-based grouping in `elementUniquenessRule`. Collect element `id` locations across **all** scenarios in one pass (no `groups` map keyed by `sceneId` — just one `idLocations` map for the whole `scenarios` array).
2. Keep the same error shape/message style, but drop the "within scene '...'" framing since the check is no longer scene-scoped — e.g. `Duplicate element ID '${eid}' found across multiple scenarios (scenario indices: ...).`
3. Keep the rule's signature and registration in `validators/index.js` unchanged (it already runs as a `crossScenarioRule` over the full `scenarios` array — no change needed there).

### Scope (smallest file set)

- `src/validators/rules/element-uniqueness.js` — rewrite the grouping logic only. No changes to `stop-count`, `path-shape`, `image-sequence`, the builder, or either engine.
- `src/validators/rules/__tests__/element-uniqueness.test.js` — update the existing "different sceneId" test to assert an error instead of a pass; add a same-`sceneId` case if not already redundant with the rewritten logic.

### Verification checklist

1. Behavioral test: two scenarios with different `sceneId` values, one shared element `id` → validator error naming both scenario indices.
2. Behavioral test: two scenarios with the same `sceneId`, one shared element `id` → validator error (unchanged from current behavior, just via the new code path).
3. Behavioral test: disjoint element `id`s across any number of scenarios/`sceneId`s → passes.
4. Behavioral test: the Pasar Malam lantern schema shape itself (`lantern-1-wrap` in the scroll scenario, `lantern-1` in the time scenario — distinct ids) → passes, confirming the wrapper pattern remains valid under the tightened rule.
5. Confirm collect-all-errors behavior unchanged — every duplicate location across the whole project is reported, not just the first pair found.
6. Grep `element-uniqueness.js` for `sceneId` — zero results (confirms the per-scene grouping was actually removed, not just supplemented).

---

## 2. Validator — Fix Note: Remove Duplicate Stop-Count Check from `image-sequence` Rule

**Problem:** `stop-count.js` already generically validates every `keyframes` property's `.stops` array (including `keyframes.imageSequence.stops`, since it has the same shape) for `length >= 2`. `image-sequence.js` independently re-implements this exact same check (`stops.length < 2` → error). Two rules asserting the same fact about the same field is a real DRY violation, not just a style nit — `path-shape.js` already establishes and documents the correct pattern for this exact situation: it owns `path.stops[].v` range validation and explicitly leaves the length check to `stop-count`, with a comment stating so (`"This check lives here because no other rule owns path.stops validation"`). `image-sequence.js` should follow the same convention.

### Decision

`image-sequence.js` no longer checks `stops.length < 2` (or `stops === undefined`/`stops` not-an-array in the sense of "too short") — that responsibility belongs entirely to `stop-count.js`, which already runs on every element via `elementRules` and already covers `keyframes.imageSequence.stops` today with no changes needed there.

`image-sequence.js` keeps ownership of everything `stop-count` does **not** check: `frames` validation, and per-stop `p`/`v` **type** checks (todo: `v` gets a range check too, see Item 3 below) — i.e., shape and domain validation specific to image sequences, not the generic length rule.

### Fix

1. In `image-sequence.js`, remove the `stops === undefined/null` required-check and the `stops.length < 2` check (both are already covered by `stop-count.js` running on the same `keyframes.imageSequence` entry).
2. Keep the `!Array.isArray(stops)` check only if `stop-count.js` doesn't already produce a clear error for a non-array `stops` — confirm this first; if `stop-count.js`'s `!Array.isArray(stops) || stops.length < 2` branch already fires a clear message in that case, drop the redundant array-type check from `image-sequence.js` too and rely on `stop-count` entirely for structural validity of the array itself.
3. Keep the per-stop `p`/`v` type-check loop (`typeof stop.p !== 'number'`, `typeof stop.v !== 'number'`) — this is image-sequence-specific (and where Item 3's range check gets added) and has no equivalent in `stop-count`.
4. Add a code comment mirroring `path-shape.js`'s convention: `// stops.length >= 2 is validated by stop-count.js — not re-checked here.`

### Scope (smallest file set)

- `src/validators/rules/image-sequence.js` only. No changes to `stop-count.js`, `path-shape.js`, or any other rule.
- `src/validators/rules/__tests__/image-sequence.test.js` — remove/update any test asserting `image-sequence.js` itself produces the "must have at least 2 stops" error; that assertion belongs in `stop-count.test.js` (confirm it's already covered there — it should be, since `stop-count` is generic).

### Verification checklist

1. Grep `image-sequence.js` for `stops.length < 2` — zero results.
2. Grep `stop-count.test.js` for an `imageSequence`-shaped case with `<2` stops — present (confirms coverage didn't just disappear, it moved to the rule that already owns it).
3. Behavioral test: `keyframes.imageSequence` with 1 stop → still produces exactly one error (from `stop-count`, not two from both rules).
4. Behavioral test: `keyframes.imageSequence` with a non-array `frames` → still errors (unaffected, `image-sequence.js` still owns this).
5. Confirm total validator error count for a schema with a too-short `imageSequence.stops` array did not double after this change — this is the actual regression this fix-note prevents.

---

## 3. Validator — Fix Note: Validate `imageSequence.stops[].v` Against `frames.length`

**Problem:** `image-sequence.js` checks that each stop's `v` is a number (a frame index) but never checks it's a **valid** frame index for the sequence it belongs to. At runtime, `imageSequenceProperty.js`'s `compose()` clamps out-of-range indices silently: `Math.max(0, Math.min(frames.length - 1, Math.round(rawIndex)))`. An author writing `{ p: 1, v: 40 }` against a 10-frame sequence gets no validation error — just an animation that silently sticks on the last frame once progress crosses whatever point maps to index 9, with no build-time signal that anything is wrong. `path-shape.js` already establishes the precedent for this exact category of check — it validates `path.stops[].v` is within `[0, 1]` at build time rather than letting an out-of-range value silently misbehave downstream. `image-sequence` should have the analogous check.

### Decision

Add a range check: for every stop in `keyframes.imageSequence.stops`, `stop.v` must satisfy `0 <= v <= frames.length - 1` (when `frames` is a valid non-empty array — skip this check if `frames` already failed its own validation earlier in the same rule, to avoid a confusing secondary error). Non-integer `v` values are **not** rejected — `compose()` already rounds via `Math.round`, and fractional frame indices mid-tween are the normal, expected case during a stop-to-stop tween, not an authoring error.

### Fix

1. In `image-sequence.js`, after the existing `frames` and `stops` type/shape checks, add a per-stop range check: if `frames` is a valid non-empty array and `stop.v` is a number, assert `stop.v >= 0 && stop.v <= frames.length - 1`. On failure, push an error naming the stop index, the offending value, and the valid range (mirroring `path-shape.js`'s message style: `` `imageSequence.stops[${idx}].v must satisfy 0 <= v <= ${frames.length - 1} (frames.length - 1). Got: ${JSON.stringify(v)}.` ``).
2. Only run this check when `frames` itself is valid (a non-empty array) — if `frames` is missing/invalid, that error is already reported separately and a second, confusing "range" error referencing an invalid `frames.length` should not also fire.

### Scope (smallest file set)

- `src/validators/rules/image-sequence.js` only. No changes to `imageSequenceProperty.js`'s runtime clamping behavior — clamping stays as a defensive runtime fallback, it just should no longer be the *only* signal an author gets.
- `src/validators/rules/__tests__/image-sequence.test.js` — add the new range-check cases.

### Verification checklist

1. Behavioral test: `frames` with 10 entries, a stop with `v: 40` → validator error naming the stop index and the valid range.
2. Behavioral test: `frames` with 10 entries, a stop with `v: -1` → validator error (below range).
3. Behavioral test: `frames` with 10 entries, a stop with `v: 9` (last valid index) → passes.
4. Behavioral test: `frames` with 10 entries, a stop with `v: 4.5` (mid-tween fractional index) → passes, confirming fractional values are not rejected.
5. Behavioral test: invalid/missing `frames` **and** an out-of-range `v` → only the `frames`-related error(s) fire, not an additional confusing range error computed against an invalid `frames.length`.
6. Confirm collect-all-errors behavior unchanged — multiple out-of-range stops across different elements are all reported.

---

## Not yet scoped (flagged, do not action)

- `useMotionProject`'s Effect 2 uses `try/catch` to swallow the expected "engine not ready" race against `loadProject`. Harmless in practice (Effect 1 forwards the same initial `playStates`), but using exceptions for a known/expected race is not clean. No fix scoped — revisit only if it causes an actual bug, not preemptively.
- `useSmoothScroll`'s effect dependency array only tracks `options.lerp`, not the full `options` object — other Lenis option changes won't trigger re-initialization without a remount. Acceptable for the current demo-only usage. Not scoped.
