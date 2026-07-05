# MotionPath Validators — Revision Plan

**Audience:** AI coding agent (Gemini / Antigravity) executing this directly against `src/validators/`.
**Scope:** 3 correctness bugs + 1 signature refactor. No new abstractions, no new dependencies, no behavior changes beyond what's specified.
**Out of scope:** Do not touch `path-shape.js`, `path-xy-exclusivity.js`, `direction-ambiguity.js`, `element-uniqueness.js`, `ease-collision.js`, `trigger-shape.js` — these are correct as-is.

Execute tasks in order. Each task is independent and separately testable — run the full test suite after each one before moving to the next.

---

## Task 1 — `stagger-shape.js`: reject non-number stagger

**Problem:** The locked design decision is "stagger is a plain number only; GSAP's native object-shaped stagger (`{each, amount, from, grid...}`) is explicitly rejected." The current rule instead special-cases `stagger.each` and validates it as if object form were legal. This directly contradicts the design decision and silently accepts a shape v1 does not support.

**Fix:**
- If `typeof stagger !== 'number'` (and stagger is not null/undefined, which is the "omitted" case already handled), push a single `error`: `"scenario.stagger must be a plain number. Object-form stagger (e.g. { each, amount, from }) is not supported."` Do not attempt to read `.each` or validate anything inside the object.
- Keep existing behavior for the number case unchanged: negative → error, non-zero + `elements.length < 2` → warning.

**File:** `src/validators/rules/stagger-shape.js`

**Test changes:** `rules/__tests__/stagger-shape.test.js`
- Delete the two assertions that currently exercise `{ each: -0.2 }` / `{ each: 0.2 }` as valid-ish input.
- Add: `stagger: { each: 0.2 }` → expect exactly 1 error, `ruleId: "stagger-shape"`.
- Add: `stagger: "0.2"` (string) → expect 1 error, same ruleId.
- Keep: negative-number, warning-below-2-elements, positive+2-elements-pass, omitted-pass.

---

## Task 2 — `schema-version.js`: exact-match, not "any positive integer"

**Problem:** Locked decision is "exact-match validation, not lenient — no backward compatibility." Current rule accepts *any* positive integer, so `schemaVersion: 999` passes. That's leniency, not exact-match.

**Fix:**
- Add a single exported constant `CURRENT_SCHEMA_VERSION = 1` at the top of the file (or in a new tiny `constants.js` if you prefer — see note below — but a local const is simpler and sufficient here; don't build a config system for one value).
- Replace the "positive integer" check with: `schemaVersion !== CURRENT_SCHEMA_VERSION` → error, message: `` `schemaVersion must be exactly ${CURRENT_SCHEMA_VERSION}. Got: ${JSON.stringify(schemaVersion)}.` ``
- Keep the existing "missing" and "not an object" checks as-is — those are still correct, distinct failure modes worth their own messages.

**File:** `src/validators/rules/schema-version.js`

**Test changes:** `rules/__tests__/schema-version.test.js`
- Update "not an integer" (`1.5`) and "not positive" (`0`, `-1`) tests — these still error, but now because they fail exact-match, not the old integer/positivity check. Assertions on `errors.length` / `severity` stay the same; no behavior change needed in the test itself.
- Add: `schemaVersion: 2` (a valid-looking but wrong version) → expect 1 error.
- Keep: `schemaVersion: 1` → 0 errors.

**Note on `CURRENT_SCHEMA_VERSION` placement:** if any other rule ever needs this constant, move it to `src/validators/constants.js` at that point. Don't create the file preemptively for a single consumer — that's the over-engineering trap, not DRY.

---

## Task 3 — `index.js`: don't let a malformed `scenarios` field validate as clean

**Problem:** `isValidShape()` returns `false` when `scenarios` is missing or not an array, and `validateProject` then returns early with whatever errors have accumulated so far (schema-version only). If `schemaVersion` happens to be valid, the result is `[]` — a structurally broken project reports as fully valid. A validator returning a false "no errors" is worse than it throwing.

**Fix:**
- In the `!isValidShape(schema)` branch, before returning, push one structural error:
  ```
  { ruleId: "invalid-shape", severity: "error", message: "schema.scenarios must be an array.", path: "$.scenarios" }
  ```
  Only push it if `schema` is a non-null object (the `!schema || typeof schema !== 'object'` case is already fully covered by `schema-version`'s own "must be a valid JSON object" error — don't double-report).

**File:** `src/validators/index.js`

**Test changes:** `__tests__/index.test.js`
- Update the "scenarios is not an array" case: expect `validateProject(badScenarios)` to contain a `ruleId: "invalid-shape"` entry, not length `0`. Remove the comment block that currently rationalizes the `0`-length result — that comment was rationalizing a bug.
- Add a case for `scenarios` entirely absent (`{ schemaVersion: 1 }`) → same `invalid-shape` error, and confirm no exception.

---

## Task 4 — `index.js` + `perspective-usage.js`: uniform scenario-rule signature (remove identity branching)

**Problem:**
```js
if (rule === perspectiveUsageRule) {
  errors.push(...runSafely(rule, scenario, schema.perspective, scenarioPath));
} else {
  errors.push(...runSafely(rule, scenario, scenarioPath));
}
```
Branching on function identity inside a generic loop breaks the "flat list of independently pluggable rule functions" design. Every future scenario rule that needs schema-level context forces another branch here — this violates open/closed (the runner has to change every time a rule's needs change) and isn't testable as a generic loop anymore.

**Fix — give every scenario rule the same signature:** `rule(scenario, context, path)`, where `context` is `{ schema }`. Rules that don't need it just ignore the parameter.

1. **`perspective-usage.js`:** change signature from `(scenario, schemaPerspective, path)` to `(scenario, context, path)`. Inside, read `context.schema.perspective` instead of the old second param. Update the JSDoc to drop the "NOTE: deviates from ScenarioRule signature" comment — it no longer deviates.

2. **`trigger-shape.js`, `ease-collision.js`, `stagger-shape.js`:** no code change needed — just confirm/update their signatures to `(scenario, context, path)` even though they ignore `context`, so every rule in `scenarioRules` is literally interchangeable. (If you want to skip touching files that don't use `context`, that's acceptable too — JS won't complain about an unused positional arg — but updating the JSDoc `@param` lists for consistency is good practice for the next person reading the file.)

3. **`index.js`:** replace the branching loop with:
   ```js
   const context = { schema };
   for (const rule of scenarioRules) {
     errors.push(...runSafely(rule, scenario, context, scenarioPath));
   }
   ```
   Delete the `if (rule === perspectiveUsageRule)` branch entirely.

**Test changes:**
- `rules/__tests__/perspective-usage.test.js`: update every call site from `perspectiveUsageRule(scenario, perspectiveValue, path)` to `perspectiveUsageRule(scenario, { schema: { perspective: perspectiveValue } }, path)`. No new cases needed — this is a call-signature update only, behavior is unchanged.
- `__tests__/index.test.js`: no changes needed if it only tests through `validateProject` (it should — integration tests shouldn't know about internal rule signatures).

---

## Regression checklist (run after all 4 tasks)

- [ ] Full test suite passes, including updated tests above.
- [ ] `validateProject` never throws for any input shape (`null`, `{}`, arrays, strings) — confirm via the existing "garbage input" test plus the new Task 3 cases.
- [ ] No rule file reads `schema` except via `context` (Task 4) — confirms `perspective-usage.js` no longer has a special call path.
- [ ] Grep the file for `=== perspectiveUsageRule` — should return zero matches after Task 4.
- [ ] Re-read `rules/__tests__/stagger-shape.test.js` and `rules/__tests__/schema-version.test.js` — both should look like they're testing *stricter* behavior than before, not looser.

## Explicitly not doing (avoid scope creep)

- No JSON-schema library, no runtime type-validation framework — hand-rolled rules stay hand-rolled, consistent with the rest of the module.
- No plugin-registration/metadata system for rules (e.g. rules declaring their own required context keys). A single `{ schema }` context object covers every real need today; build a fancier registration mechanism only when a second rule actually needs a second piece of top-level context.
- No changes to element-level or cross-scenario rule signatures — they don't have this problem.
