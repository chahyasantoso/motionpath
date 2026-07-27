# MotionPath — Implementation Brief 1: Schema Validator

**Status:** Design-complete, ready for implementation. This is a standalone spec — implement against this document only, no other context needed.

**Scope of this brief:** static schema validation only (pure JSON in, error list out, no DOM, no GSAP). The separate runtime DOM-resolution check (element `id` → `data-motion-id` lookup) is explicitly **out of scope** for this module — see Non-Goals.

---

## 1. Purpose

Validate a MotionPath project JSON against all structural/semantic rules **before** it reaches the builder. The builder must be able to assume every schema it receives is valid — this module is the single point where invalid schemas are caught and reported, so no downstream code needs defensive re-checking.

Runs once per project load, entirely synchronously, on plain JSON. No side effects.

---

## 2. Public Interface

```ts
interface ValidationError {
  ruleId: string; // e.g. "ease-collision", "timeline-primary-count"
  severity: "error" | "warning";
  message: string; // human-readable, specific enough to act on without re-reading this spec
  path: string; // JSON path to the offending node, e.g. "scenarios[2].elements[0].keyframes.x"
}

function validateProject(schema: unknown): ValidationError[];
```

- Single exported entry point. Everything else (individual rule functions) is internal to the module — not exported, not part of the public contract. Callers only ever call `validateProject`.
- Returns **all** violations found, not just the first (collect-all, not fail-fast). Empty array = valid.
- Never throws. Malformed/garbage input (wrong types, missing top-level fields, `null`, non-object) must produce `ValidationError` entries, not a runtime exception. See §6, Security & Robustness.
- Pure function. No I/O, no mutation of the input.

---

## 3. Internal Architecture (how to structure the module — not optional, this is the point of the brief)

Two buckets of small, independent rule functions, plus one thin orchestrator. Each rule function is independently unit-testable with a minimal fixture — no rule function should require a full valid project to test.

```ts
// Per-scenario rules: operate on one scenario at a time, no knowledge of siblings
type ScenarioRule = (scenario: unknown, path: string) => ValidationError[];

// Per-element rules: operate on one element + its parent scenario (for trigger-type context)
type ElementRule = (
  element: unknown,
  scenario: unknown,
  path: string,
) => ValidationError[];

// Cross-scenario rules: need the full scenarios array (group/uniqueness checks)
type CrossScenarioRule = (scenarios: unknown[]) => ValidationError[];
```

**File layout (one rule = one file = one test file):**

```
/validators
  index.ts                      -- validateProject, orchestrator only
  rules/
    schema-version.ts           -- top-level guard, runs first
    trigger-shape.ts            -- one-trigger-type-per-scenario, repeat-not-on-scrub,
                                    delay-not-on-scrub, end-trigger-cascade
    ease-collision.ts
    direction-ambiguity.ts
    path-xy-exclusivity.ts
    path-shape.ts                -- points count, stops.v range
    stagger-shape.ts
    perspective-usage.ts         -- warning-level
    timeline-group.ts            -- same-type, no-observer, exactly-one-primary
    element-uniqueness.ts        -- cross-scenario id collision
  rules/__tests__/
    <one test file per rule file above>
```

**Orchestrator (`index.ts`) — the only place that changes when a rule is added/removed:**

```ts
const scenarioRules: ScenarioRule[] = [
  triggerShapeRule,
  easeCollisionRule,
  staggerShapeRule,
  perspectiveUsageRule,
];
const elementRules: ElementRule[] = [
  directionAmbiguityRule,
  pathXYExclusivityRule,
  pathShapeRule,
];
const crossScenarioRules: CrossScenarioRule[] = [
  timelineGroupRule,
  elementUniquenessRule,
];

export function validateProject(schema: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  errors.push(...runSafely(schemaVersionRule, schema, "$"));
  if (!isValidShape(schema)) return errors; // can't safely iterate further; bail with what we have

  for (const [i, scenario] of schema.scenarios.entries()) {
    const scenarioPath = `scenarios[${i}]`;
    for (const rule of scenarioRules)
      errors.push(...runSafely(rule, scenario, scenarioPath));
    for (const [j, element] of (scenario.elements ?? []).entries()) {
      const elementPath = `${scenarioPath}.elements[${j}]`;
      for (const rule of elementRules)
        errors.push(...runSafely(rule, element, scenario, elementPath));
    }
  }
  for (const rule of crossScenarioRules)
    errors.push(...runSafely(rule, schema.scenarios));

  return errors;
}

// Wraps every rule call — one rule throwing must not kill the whole validation pass.
function runSafely(rule, ...args) {
  try {
    return rule(...args);
  } catch (e) {
    return [
      {
        ruleId: "internal-error",
        severity: "error",
        message: `Validator rule threw unexpectedly: ${e.message}`,
        path: String(args.at(-1)),
      },
    ];
  }
}
```

This structure is the actual deliverable — a coding agent should follow this file layout and orchestrator pattern exactly, not invent an alternative (e.g. a single switch statement, or a class hierarchy). Flat functions + array + loop is the simplest structure that satisfies "independently testable" and "closed for modification when adding a rule."

---

## 4. Complete Rule Set

Each rule below: **ID, severity, scope, logic, and concrete test cases.**

### 4.1 `schema-version` — error — top-level

- `schema.schemaVersion` must be present and a positive integer.
- Test: `{}` → error. `{ schemaVersion: "1" }` → error (string, not number). `{ schemaVersion: 1, ... }` → no error from this rule.

### 4.2 `trigger-shape` — error — per-scenario

Bundles everything about trigger validity:

- `scenario.trigger.type` must be exactly one of `"scroll"`, `"time"`.
- If `type === "scroll"`: `scrub` must be boolean, present.
- `endTrigger` present + NOT (`type === "scroll" && scrub === true`) → error.
- `repeat`, `yoyo`, or `repeatDelay` present + `type === "scroll" && scrub === true` → error (scrub-incompatible; see architecture doc §7).
- `delay` present + `type === "scroll" && scrub === true` → error.
- Test cases:
  - `{ type: "scroll", scrub: true, endTrigger: "#x" }` → no error.
  - `{ type: "scroll", scrub: false, endTrigger: "#x" }` → error (`endTrigger` forbidden on observer).
  - `{ type: "time", duration: 2, repeat: -1 }` → no error.
  - `{ type: "scroll", scrub: true, repeat: -1 }` → error.
  - `{ type: "scroll", scrub: true, delay: 1 }` → error.

### 4.3 `ease-collision` — error — per-scenario

- For every pair of distinct keyframe properties on the same element, if two `stops` entries share the same literal `p` value but different `ease` values → error.
- Test:
  - `x.stops = [{p:0.5, v:10, ease:"power1.in"}]`, `y.stops = [{p:0.5, v:20, ease:"power2.out"}]` → error (collision at `p:0.5`).
  - Same `p:0.5` but identical `ease` on both, or one omits `ease` → no error.
  - Different `p` values entirely → no error.

### 4.4 `direction-ambiguity` — error — per-element

Applies per keyframe property on the element:

- 2+ stops → `direction` ignored, never an error regardless of value.
- 1 stop, `p ≈ 0` (within epsilon `0.001`), `direction` omitted → inferred `"from"`, no error.
- 1 stop, `p ≈ 1`, `direction` omitted → inferred `"to"`, no error.
- 1 stop, `p` elsewhere, `direction` omitted → error.
- 1 stop, `direction === "fromTo"` → error (needs 2 stops).
- Test:
  - `{ stops: [{p:0}], direction: undefined }` → no error.
  - `{ stops: [{p:0.5}], direction: undefined }` → error.
  - `{ stops: [{p:0}], direction: "fromTo" }` → error.
  - `{ stops: [{p:0},{p:1}], direction: "fromTo" }` → no error.

### 4.5 `path-xy-exclusivity` — error — per-element

- `keyframes.path` and (`keyframes.x` or `keyframes.y`) both present on the same element → error.
- Test: element with both `path` and `x` → error. Element with only `path` → no error. Element with `x`+`y` only → no error.

### 4.6 `path-shape` — error — per-element

Only runs if `keyframes.path` is present:

- `path.points.length >= 4` and `(points.length - 1) % 3 === 0` → else error (invalid Bézier chain).
- Every `path.stops[].v` must satisfy `0 <= v <= 1` → else error.
- Test:
  - `points` length 4 → valid. Length 5 → error. Length 7 → valid.
  - `stops: [{p:0, v:0}, {p:1, v:1.5}]` → error (`v` out of range).

### 4.7 `stagger-shape` — mixed — per-scenario

- `scenario.stagger` present and negative → **error**.
- `scenario.stagger` present, non-zero, and `elements.length < 2` → **warning** (no-op, not structurally wrong).
- Test: `stagger: -0.1` → error. `stagger: 0.2` with 1 element → warning. `stagger: 0.2` with 3 elements → no error/warning.

### 4.8 `perspective-usage` — warning — per-scenario

- If any element in the project uses `z`, `rotationX`, or `rotationY`, and top-level `schema.perspective` is absent → warning.
- Note: this rule technically needs top-level `schema` access alongside the scenario — pass `schema.perspective` in as a second argument from the orchestrator (deviates slightly from the pure `ScenarioRule` signature; acceptable, document the exception inline in code rather than distorting the whole rule-type system for one field).
- Test: element uses `rotationX`, top-level `perspective` absent → warning. Same element, `perspective: 800` present → no warning. Element uses only `x`/`y` → no warning regardless of `perspective`.

### 4.9 `timeline-group` — error — cross-scenario

Group scenarios by `timelineId` (ignore scenarios with no `timelineId` — ungrouped is always valid):

- All scenarios in a group must have the identical `trigger.type` (and identical `trigger.scrub` if type is `scroll`) → else error.
- No scenario in a group may have `trigger.type === "scroll" && trigger.scrub === false` (observer can never be grouped) → else error.
- Exactly one scenario per group must have `primary === true` → zero or 2+ → error.
- Test:
  - Group of two `type:"time"` scenarios, one `primary:true` → no error.
  - Group mixing `type:"time"` and `type:"scroll"` → error.
  - Group containing an observer scenario (`scroll`, `scrub:false`) → error.
  - Group with zero `primary:true` → error. Group with two → error.

### 4.10 `element-uniqueness` — error — cross-scenario

- Group scenarios by `sceneId`. Within each group, collect all element `id`s across all scenarios sharing that `sceneId`. Any `id` appearing more than once → error.
- Test: two scenarios, same `sceneId`, disjoint element ids → no error. Same `sceneId`, one element id repeated across both → error. Same element id, but different `sceneId` → no error (uniqueness is scoped per `sceneId`, not global).

---

## 5. Explicit Non-Goals (do not implement these — flagged to prevent scope creep)

- **No DOM/runtime validation.** The `id` → `data-motion-id` existence check is a separate module (`resolveElements.ts` or similar) that runs at scene init against a live DOM. It is not part of `validateProject` and must not be added here — this module must remain testable with plain JSON fixtures and zero DOM dependency.
- **No auto-fixing or normalization.** This module reports errors; it never mutates or "corrects" the input schema (e.g. don't auto-nudge colliding `ease` percents).
- **No support for `offset`, `label`, or `staggerGroups` fields.** These are wishlist items, not yet part of the schema. Do not add speculative validation for fields that don't exist yet.
- **No async validation, no plugin-loading.** Lazy plugins (`splitText` etc.) are not validated for their internal config shape in this pass — out of scope until those plugins are actually specified.
- **No CLI, no file I/O.** This is a pure function library, not a tool. Wiring it into a CLI or build step is a separate concern.

---

## 6. Security & Robustness Notes

This validates **author-supplied JSON** — not attacker-controlled in the traditional sense, but it must never crash the process on malformed input, since a bad project file is a very plausible real-world event (typo, half-written JSON, wrong file loaded).

- Every rule function must defensively handle missing/wrong-typed fields — never assume `scenario.trigger` exists, never assume `elements` is an array. Use optional chaining / nullish coalescing (`scenario?.trigger?.type`), not direct property access.
- The orchestrator's `runSafely` wrapper (§3) is mandatory, not optional — one rule throwing on unexpected shape must degrade to a reported `internal-error`, never an uncaught exception that kills the whole validation pass.
- No `eval`, no dynamic `require`/`import` of schema-supplied strings anywhere in this module (not currently a risk given the rule set above, but worth stating as a constraint for whoever extends this later).
- Depth/size: no artificial limits needed for v1 — project JSON is author-written, not user-uploaded at scale. Not worth adding a max-scenarios or max-depth guard speculatively.

---

## 7. Testing Requirements

- One test file per rule file, colocated under `rules/__tests__/`.
- Every test case listed in §4 must exist as an actual test — they are not illustrative, they are the acceptance criteria.
- One additional integration test file (`index.test.ts`) covering: (a) a fully valid minimal project → empty array, (b) a project with multiple simultaneous violations across different rules → all of them present in the returned array (proves collect-all works end-to-end), (c) a garbage/malformed top-level input (`null`, `{}`, `{ scenarios: "not an array" }`) → returns errors, does not throw.
- No test should require constructing a full valid project to exercise a single unrelated rule — this is the entire point of the per-rule-function architecture in §3. If a test file needs a large fixture to test one small rule, that's a signal the rule function's scope is wrong.

---

## Addendum B — Correct `path-shape` to Validate Raw Waypoints, Not a Pre-Converted Cubic Array

**Problem:** this rule was originally specified against the assumption that `path.points` arrives as a final cubic Bézier array (`(points.length - 1) % 3 === 0 && points.length >= 4`). That assumption is stale — `pathPlugin.js`'s `contribute()` correctly converts raw waypoints (`{x, y, z?, ctrlX?, ctrlY?, ctrlZ?}`) into the cubic form internally, at build time, via `convertToCubicPath()`. The validator was never updated to match, so it currently rejects the correct, intended authoring format and would only accept content that no longer matches what the plugin expects.

**Corrected rule — validates the actual input shape:**

```js
export function pathShapeRule(element, scenario, context, path) {
  const errors = [];
  const points = element?.keyframes?.path?.points;
  if (!Array.isArray(points)) return errors;

  const pointsPath = `${path}.keyframes.path.points`;

  if (points.length < 2) {
    errors.push({
      ruleId: "path-shape",
      severity: "error",
      message: "path.points needs at least 2 waypoints to form a path.",
      path: pointsPath,
    });
    return errors;
  }

  points.forEach((pt, i) => {
    const ptPath = `${pointsPath}[${i}]`;
    if (typeof pt?.x !== "number" || typeof pt?.y !== "number") {
      errors.push({
        ruleId: "path-shape",
        severity: "error",
        message: "each path point requires numeric x and y.",
        path: ptPath,
      });
    }
    const hasCtrlX = pt?.ctrlX !== undefined;
    const hasCtrlY = pt?.ctrlY !== undefined;
    if (hasCtrlX !== hasCtrlY) {
      errors.push({
        ruleId: "path-shape",
        severity: "error",
        message: "ctrlX and ctrlY must be provided together, or not at all.",
        path: ptPath,
      });
    }
    if (i === 0 && (hasCtrlX || hasCtrlY)) {
      errors.push({
        ruleId: "path-shape",
        severity: "warning",
        message:
          "ctrlX/ctrlY on the first path point have no effect (no preceding segment to curve).",
        path: ptPath,
      });
    }
  });

  return errors;
}
```

**Why the `ctrlX`/`ctrlY` pairing check matters, not just extra strictness:** `convertToCubicPath` determines curvature via `isCurved = ctrlX !== undefined && ctrlY !== undefined`. A typo or omission of one half of the pair doesn't error inside the conversion — it silently produces a straight segment instead of the intended curve. That's exactly the "runs but wrong" failure class worth catching at validation time rather than leaving someone to debug a mysteriously flat curve later.

**This supersedes the old `path.stops[].v` range check's neighbor logic only where it concerned `points`** — the `v ∈ [0,1]` check on `stops` is unaffected and stays exactly as originally specified; only the `points`-shape half of this rule changes.

**Test cases (replacing the old cubic-chain test cases):**

- `points: [{x:0,y:0}]` (length 1) → error.
- `points: [{x:0,y:0},{x:10,y:10}]` → no error (minimum valid path).
- `points: [{x:0,y:0},{x:10,y:10,ctrlX:5}]` (missing `ctrlY`) → error.
- `points: [{x:0,y:0,ctrlX:1,ctrlY:1},{x:10,y:10}]` → warning (ctrl on first point is a no-op).
- `points: [{x:"a",y:0},{x:1,y:1}]` → error (non-numeric `x`).

---

## Addendum A — Uniform Rule Signature (supersedes §3's rule type definitions)

**Problem found in review:** `ease-collision.js`, `stagger-shape.js`, and `trigger-shape.js` each shipped with a runtime signature-sniffer:

```js
// WRONG — do not reintroduce this pattern anywhere in this module
if (typeof context === "string") {
  path = context;
  context = undefined;
}
```

This lets a rule be called either the old two-arg way or a new three-arg way, so both the rule's own stale tests and the orchestrator's calls keep passing. It works, but every rule now silently supports two calling conventions forever — the exact inconsistency a uniform signature exists to prevent. `perspective-usage.js`/`perspective-usage.test.js` already do this correctly; every other rule and its test file must match that pattern exactly, not the other way around.

**Corrected, final contract — no exceptions, no sniffing:**

```ts
type ScenarioRule = (
  scenario: unknown,
  context: RuleContext,
  path: string,
) => ValidationError[];
type ElementRule = (
  element: unknown,
  scenario: unknown,
  context: RuleContext,
  path: string,
) => ValidationError[];
type CrossScenarioRule = (
  scenarios: unknown[],
  context: RuleContext,
) => ValidationError[];

interface RuleContext {
  schema: unknown; // the full top-level project object, read-only
}
```

- Every `ScenarioRule` and `ElementRule` now always receives `context`, whether or not that specific rule needs it. A rule that doesn't need `schema` simply ignores the parameter — this costs nothing and keeps every rule's call signature identical, which is what makes the orchestrator loop in §3 correct as written (one calling convention, no branching per rule).
- **Required fix:** remove the signature-sniffing block from all three affected rule files.
- **Required fix:** update `ease-collision.test.js`, `stagger-shape.test.js`, and `trigger-shape.test.js` to call the rule with the full three-argument signature — do not preserve the old two-arg calls "for compatibility." There is no compatibility concern here; nothing external depends on this internal function signature.
- **Test to add:** one shared test asserting every exported rule function has arity matching its declared type (`ScenarioRule` → length 3, `ElementRule` → length 4, `CrossScenarioRule` → length 2). This is cheap and catches a regression to the sniffing pattern immediately, without needing to inspect each rule file by hand on every future change.
