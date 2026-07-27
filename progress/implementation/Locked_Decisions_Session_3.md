# MotionPath — Locked Decisions, Session 3

Four items. All are fix-notes against already-implemented work (Brief 1, Brief 2) — not new briefs. Scope is deliberately kept to the smallest file set per item; do not let any of them bleed into unrelated files.

---

## 1. Brief 2 — Addendum C: Compose Signature Simplification

**Supersedes:** a prior two-channel (`animated`/`runtime`, or `values`/`derived`) proposal from an external source. Rejected — see rationale.

### Decision

- Drop the `__` prefix convention entirely (`__blur` → `blur`, `__pathProgress` → `pathProgress`, etc.). The prefix was never GSAP-native — GSAP has no opinion on proxy key names. It was a cosmetic naming convention with no mechanism attached, and it implied a synthetic-vs-real distinction that nothing in the pipeline actually checks.
- `compose()` stays **two arguments, one dynamic proxy object.** No second channel.

```ts
type MotionValue = number | string | boolean | null;

interface Plugin {
  claimsKey(key: string): boolean;
  contribute(
    propertyKey: string,
    stops: Stop[],
    elementCfg: unknown,
  ): {
    percentPatch: Record<string, Record<string, unknown>>;
    tweenVars?: Record<string, unknown>;
  };
  compose?(
    data: Record<string, MotionValue>, // proxy state — whatever keys this element actually animates
    elementCfg: unknown, // static schema config (e.g. path.points)
  ): Record<string, unknown>;
}
```

- `subscribe()` broadcast payload unaffected — still raw proxy state, just with renamed keys.
- `useMotionSubscriber` signature unaffected: `transformFn(rawData, compose)`. No `transformFn` → hook calls `compose(rawData, elementCfg)` directly.

### Rationale

- The proxy object is already per-element and dynamic — it only contains keys for properties that element actually tweens. A second `runtime`/`derived` map duplicates that dynamism instead of using what already exists.
- One map removes a judgment call ("which channel does this key belong in") every future plugin author would otherwise have to get right — fewer decisions, fewer chances for drift or a Gemini-style silent miscategorization.
- No new invariant to test or maintain. Existing proxy-not-DOM tests cover this unchanged.

### Scope (smallest file set)

- Any plugin's `contribute()`/`compose()` currently writing/reading `__blur`, `__pathProgress`, or similar — rename keys.
- `compose()` call sites — confirm two-arg signature, no wrapper object introduced.
- **No changes** to `subscribe()`, builder merge logic, or `EngineCore`.

### Verification checklist

1. Grep for `__` prefix on any proxy-facing key across plugin files — zero results.
2. Grep for `ComposeInput`, `runtime:`, `derived:` — zero results (confirms the two-channel proposal was not partially adopted).
3. Confirm `compose()` call sites pass exactly `(data, elementCfg)` — no third param.
4. Behavioral test: element with only `opacity` produces a compose input with exactly one key; element with `blur` + `path` produces exactly the keys those plugins contribute — no hardcoded/fixed key set anywhere.

---

## 2. Schema Addendum — Explicit Two-Stop Keyframes (Locked)

**Supersedes:** an external draft proposal — the two-stop rule itself is adopted, its incorrect rationale is not (see below).

### Rule

Every animated property's `stops` array must contain **at least two entries** — explicit start and end. Single-stop shorthand and the `direction` field are removed. Intermediate stops remain allowed.

```json
"opacity": {
  "stops": [
    { "p": 0, "v": 0 },
    { "p": 1, "v": 1 }
  ]
}
```

### What's removed

- `direction` field — deleted from schema and from the Element section example.
- `resolveDirection()` pre-pass — deleted from builder.
- `getNaturalValue()` — deleted from the plugin contract. No engine (web, Flutter, or future) needs to implement "read current live value" to play back a MotionPath schema.
- The one sanctioned exception to proxy-not-DOM (this was the only build-time DOM read) — removed. The invariant is now absolute with no exception clause.

### Rationale

- **Single responsibility:** inference is an authoring-time concern, not a runtime-playback concern. The engine's job is to play back exactly what's declared — nothing more.
- **Portability:** removes a capability (live natural-value read) that every future engine port would otherwise be obligated to implement correctly — one less thing to get right per engine, and not CSS-specific despite the web engine's current implementation reading `getComputedStyle`.
- **Simplicity:** deletes an entire ambiguity matrix (single-stop, `p`≈0 vs `p`≈1 vs elsewhere, `fromTo` needing 2 stops) — fewer edge cases, fewer places for a silent implementation bug to hide.

### Known tradeoff (accepted, not architecturally mitigated)

Explicit stops are hardcoded values. If the true resting state drifts from what's in the schema (CSS change, theme change, etc.), the first stop can cause a visible snap when the tween starts. Accepted given the AI-agent-authors-schema workflow (the agent writing the schema typically also knows/sets the resting state). **Optional future mitigation, not scoped now:** a dev-only build-time lint comparing a schema's first-stop value against computed style, logging a mismatch — purely diagnostic, web-only, never a runtime dependency, never required for other engines.

---

## 2a. Brief 1 (Validator) — Fix Note: Remove Single-Stop / Direction Handling

**Scope:** smallest file set — the stop-count/path-shape rule(s) only. No changes to `runSafely`, rule signature, or any other rule.

### Changes

1. **Remove** the single-stop-ambiguity rule (the one erroring on `1 stop, p elsewhere` or `1 stop + direction:"fromTo"`).
2. **Add** a stop-count rule: any animated property (including `path.stops`) with fewer than 2 entries → validation error, naming the property and element id.
3. **Remove** any rule validating the `direction` field's values — field no longer exists in schema.
4. Confirm this rule still runs statically, schema-only, with the same uniform rule signature as every other rule — no special-casing.

### Verification checklist

1. Grep for `direction` across validator source — zero results.
2. Grep for `resolveDirection` and `getNaturalValue` across the whole codebase (validator + builder + plugins) — zero results.
3. Behavioral test: property with exactly 1 stop → validator returns an error naming the property/element.
4. Behavioral test: property with 2 stops → passes.
5. Behavioral test: `path.stops` with 1 entry → same error path as any other property, not a separate special-cased rule.
6. Confirm collect-all-errors behavior unchanged — multiple single-stop violations across different elements all get reported, not just the first.

---

## 2b. Brief 2 (Builder) — Fix Note: Remove `resolveDirection()` / `getNaturalValue()`

**Scope:** smallest file set — the builder's direction pre-pass and the plugin contract's natural-value hook only. No changes to merge/collision logic, `tweenVars` assignment, or proxy seeding.

### Changes

1. **Remove** the `resolveDirection()` pre-pass call from the build pipeline. The builder no longer runs any step before `contribute()` that infers a missing boundary stop.
2. **Remove** `getNaturalValue()` from the plugin contract entirely. No plugin implements it going forward; any existing per-plugin natural-value logic (computed CSS style for real properties, identity value for synthetic proxy fields) is deleted, not repurposed.
3. **Remove** the domNode read that `getNaturalValue()` depended on. This was the one sanctioned exception to proxy-not-DOM at build time — confirm no other code path still reads the DOM node during build after this is removed (the DOM node may still be used at runtime elsewhere, e.g. `compose()`'s `elementCfg`/live-state needs, if any — but not for direction inference).
4. Builder now assumes every property arriving at `contribute()` already has ≥2 explicit stops (enforced upstream by the Brief 1 validator fix, item 2a) — no defensive single-stop handling should remain in the builder.
5. Confirm merge/deep-merge, ease-collision-throws, and `tweenVars` `Object.assign`-throws logic are untouched — this fix note only removes the pre-pass and the contract method, nothing downstream of `contribute()`.

### Verification checklist

1. Grep for `resolveDirection` across builder source — zero results.
2. Grep for `getNaturalValue` across builder + all plugin files — zero results.
3. Grep for `direction` as a schema/elementCfg field read anywhere in the builder — zero results.
4. Confirm no build-time `domNode` read remains in the direction-resolution path (a targeted DOM-read spy test, same style as the existing proxy-not-DOM test, should show zero calls during build for this purpose).
5. Behavioral test: a 2-stop property builds correctly with no pre-pass invoked (can assert via spy/mock that `resolveDirection` is not called, or simply that it no longer exists as an import).
6. Existing proxy-not-DOM test, ease-collision test, and merge tests still pass unmodified — confirms this fix note didn't touch anything outside its stated scope.

---

## 3. Brief 1 (Validator) — Fix Note: Forbid `duration` on Scrub Elements

**Problem:** the prose states `duration` "overrides scenario duration; observer/time-scoped only" — implying it's meaningless on scrub scenarios (progress is scroll position, not time). But unlike `endTrigger`, `repeat`, `yoyo`, `repeatDelay`, and `delay` — which all throw a build-time error when set on a scrub scenario — `duration` on a scrub-scenario element is only silently ignored. An author gets no signal that their `duration` value did nothing.

### Fix

Add `duration` to the existing forbidden-field table, using the same mechanism already used for `endTrigger`/`repeat`/`yoyo`/`repeatDelay`/`delay`: reject at build time if an element's `duration` is set while the parent scenario's trigger is `type: "scroll", scrub: true`.

### Scope (smallest file set)

- The single forbidden-field rule/table in the validator. No changes to the builder, engine, or any other validation rule.

### Verification checklist

1. Grep the forbidden-field table/rule list for `duration` — present, alongside `endTrigger`/`repeat`/`yoyo`/`repeatDelay`/`delay`.
2. Behavioral test: element with `duration` set inside a `type:"scroll", scrub:true` scenario → validator returns an error naming the element id and field.
3. Behavioral test: element with `duration` set inside a `type:"time"` or `type:"scroll", scrub:false` scenario → passes (unaffected).
4. Confirm error message format matches the existing forbidden-field errors (same message shape as `endTrigger`-forbidden-on-non-scrub, not a new one-off format).

---

## 4. Brief 1 (Validator) — Fix Note: Forbid Non-Primary Fields in `timelineId` Groups

**Problem:** for a `timelineId` group, primary's `start`/`end`/`pin`/`pinSpacing`/`snap` (scrub) or `repeat`/`yoyo`/`repeatDelay` (time) apply to the whole group — but nothing stops a **non-primary** member from also declaring those fields. Today that produces one of two unvalidated outcomes: silent override or silent ignore, depending on implementation detail. This is the exact "runs but silently does the wrong thing" failure class the project already guards against everywhere else (see how strictly `endTrigger`/`delay`-forbidden-on-scrub are enforced) — it just hadn't been closed here yet.

### Fix

One uniform rule, not split by group type: for any scenario that is a **non-primary member of a `timelineId` group**, forbid declaring any of `start`, `end`, `pin`, `pinSpacing`, `snap`, `repeat`, `yoyo`, `repeatDelay` — build-time error if present, regardless of whether the group's trigger type is scrub or time. A scrub group's non-primary member declaring `repeat` is exactly as much an authoring mistake as declaring `pin`; one rule covering the full field set avoids the validator branching on group type to decide which subset to check, and keeps the rule easy to verify in one pass.

### Scope (smallest file set)

- One new validation rule in Brief 1's rule list, alongside the existing `timelineId` group rules (same-trigger-type, exactly-one-primary, no-observer-in-group). No changes to the builder or either engine.

### Verification checklist

1. Grep the validator's rule list for a rule covering non-primary + any of the 8 named fields.
2. Behavioral test: non-primary scrub-group member declaring `pin` → validator error naming the scenario and field.
3. Behavioral test: non-primary time-group member declaring `repeat` → validator error naming the scenario and field.
4. Behavioral test: primary member declaring any of these 8 fields → passes (rule only applies to non-primary members).
5. Behavioral test: non-primary member declaring `type`/`scrub` only (the fields it's supposed to declare for compatibility) → passes.
6. Confirm collect-all-errors behavior unchanged — multiple violations across different non-primary members in the same schema are all reported, not just the first.

---

## 5. Declined — Splitting `type: "scroll"` + `scrub` into `scroll-scrub` / `scroll-observe` Schema Types

**Proposal (from external review):** replace the `type`+`scrub` boolean-discriminant pair with two distinct top-level trigger types, removing the compound `type === "scroll" && scrub === true` condition wherever forbidden-field logic currently checks it.

**Decision: declined, not scoped.**

### Rationale

The mechanism critique is correct — `scrub` is a hidden type discriminant, and it does force compound conditions in Brief 1's forbidden-field checks. But the messiness is already contained: `ScenarioBuild.triggerType` (Brief 2 §2) is `"scroll-scrub" | "scroll-observer" | "time"` — a clean three-way discriminant the builder resolves **once, early**. Every downstream consumer (merge pipeline, `ProductionEngine`'s wiring, `EditorEngine`) already dispatches on this clean form, never on raw `type`/`scrub`. The only place still touching the compound condition is Brief 1's forbidden-field table — a single `&&` in an already-written, already-tested condition, not a structural risk spread across the codebase.

Against that marginal readability gain: schema v1 is locked final, Briefs 1–6 are written against `type`+`scrub`, and every example JSON in the project uses this shape. Changing it now costs a validator rewrite, a full example-JSON rewrite, and updates to whatever authoring guidance tells the agent how to write triggers — real cost for a stylistic preference already firewalled off from the rest of the system.

**Action:** leave `type`+`scrub` as-is. Revisit only if a schema v2 happens for unrelated reasons — do not reopen the locked v1 schema solely for this.

---

## Not yet scoped (flagged, do not action)

- Dev-only natural-value mismatch lint (see tradeoff note in section 2 above) — deferred, no brief exists.
