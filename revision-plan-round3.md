# MotionPath — Revision Plan (Round 3: validators shim + builder seeding)

**Audience:** AI coding agent (Gemini Flash) executing directly against `validators/` and `lib/`.
**Scope:** 2 tasks. No new abstractions, no behavior changes beyond what's specified.
**Out of scope:** `lib/motionEngine.js`, `lib/pathUtils.js`, `lib/projection3d.js`, `lib/validateScenario.js` — not covered by this plan, do not touch.

Run the full test suite after each task before moving to the next.

---

## Task 1 — Remove the two-arg/three-arg signature shim from three validator rules

**Problem:** `ease-collision.js`, `stagger-shape.js`, and `trigger-shape.js` each start with:
```js
if (typeof context === 'string') {
  path = context;
  context = undefined;
}
```
This exists only because each rule's own unit test still calls it the old way — `rule(scenario, 'scenarios[0]')` — while `validators/index.js` calls every scenario rule the new way — `rule(scenario, context, path)`. Every `ScenarioRule` must have exactly one signature: `(scenario, context, path)`. `perspective-usage.js` already does this correctly with no shim — match that pattern exactly.

**Fix — for each of the 3 files:**
1. Delete the `if (typeof context === 'string') { ... }` block entirely.
2. Confirm the function signature reads `(scenario, context, path)` and any internal use of `context` (currently only `perspective-usage.js` and none of these three use `context`'s contents, but keep the parameter for interchangeability with the runner).

**Files:**
- `validators/rules/ease-collision.js`
- `validators/rules/stagger-shape.js`
- `validators/rules/trigger-shape.js`

**Test changes — update every call site in these 3 files to pass a context object as the second argument, matching `perspective-usage.test.js`'s existing pattern:**
- `validators/rules/__tests__/ease-collision.test.js`
- `validators/rules/__tests__/stagger-shape.test.js`
- `validators/rules/__tests__/trigger-shape.test.js`

Change every call from:
```js
const errors = someRule(scenario, 'scenarios[0]');
```
to:
```js
const errors = someRule(scenario, {}, 'scenarios[0]');
```
(An empty object is sufficient — none of these three rules read anything off `context`. Do not invent a `schema` payload for tests that don't need one.)

**Regression check:** grep all three rule files for `typeof context` — must return zero matches when done. Grep all three test files for a rule call with exactly 2 arguments — must return zero matches when done.

---

## Task 2 — Simplify proxy seeding in `lib/builder.js`, add missing test coverage

**Problem:** To give the proxy's starting value the plugin's natural default (needed because the proxy is a bare `{}`, unlike a DOM node which always has a computed style to fall back on), the current code calls `plugin.contribute()` twice per property:
```js
const contribution = plugin.contribute(propKey, effectiveStops, element);
// ...
const seed = plugin.contribute(propKey, [{ p: 0, v: naturalValue }], element);
const seedFrame = seed?.percentPatch?.['0%'] ?? {};
for (const [pKey, pVal] of Object.entries(seedFrame)) {
  if (pKey !== 'ease' && !(pKey in proxy)) proxy[pKey] = pVal;
}
```
This only matters when `effectiveStops` has no entry at `p≈0` — but nothing currently tests that case, so the mechanism this code exists for has zero coverage. It's also doing twice the work it needs to: two calls into plugin code per property instead of one.

**Fix — collapse to a single `contribute()` call by ensuring a `p≈0` stop exists before calling it:**

```js
const hasZeroStop = effectiveStops.some(s => Math.abs(s.p - 0) < 0.001);
const stopsForContribute = hasZeroStop
  ? effectiveStops
  : [{ p: 0, v: naturalValue }, ...effectiveStops];

const contribution = plugin.contribute(propKey, stopsForContribute, element);
const percentPatch = contribution?.percentPatch || {};
const tweenVars = contribution?.tweenVars || {};

// Seed the proxy from whatever contribute() produced at "0%" — same source
// of truth as sharedKeyframes, no second contribute() call needed.
const zeroFrame = percentPatch['0%'] ?? {};
for (const [pKey, pVal] of Object.entries(zeroFrame)) {
  if (pKey !== 'ease' && !(pKey in proxy)) proxy[pKey] = pVal;
}
```

Remove the old `seed`/`seedFrame` block entirely. The rest of the merge pipeline (deep-merge into `sharedKeyframes`, ease-collision check, tweenVars merge) is unchanged — it now runs once per property instead of the percentPatch merge running once while a second, discarded contribution is also computed.

**Note:** injecting a synthetic `{p:0, v: naturalValue}` stop here is a builder-level concern distinct from `resolveDirection` (§4 of Brief 2, which only handles the single-stop case) — do not fold this into `resolveDirection`, keep it as a separate small step in the property loop as shown above.

**File:** `lib/builder.js`

**Test changes:** `lib/__tests__/builder.test.js`
- Add a case under `describe('proxy-not-DOM (critical §9)', ...)`: a property whose stops start away from `p=0` (e.g. `opacity: { stops: [{ p: 0.5, v: 0.3 }] }` with no `direction`, or two explicit stops at `p: 0.3` and `p: 0.7`) and assert the resulting `proxy` object has the correct natural-value seed for that key *before* `tween.progress()` is called (i.e. check the proxy immediately after `buildProject` resolves, not after advancing progress).
- Keep the existing `blur` test as-is — it still validates the DOM-isolation guarantee, just no longer the seeding path specifically.

---

## Regression checklist

- [ ] Full test suite passes.
- [ ] Grep `validators/rules/*.js` for `typeof context` — zero matches.
- [ ] Grep `lib/builder.js` for `seedFrame` — zero matches (old seeding path fully removed).
- [ ] New test confirms proxy seeding for a non-zero-start property, independent of `tween.progress()`.

## Explicitly not doing (flagged for the architect, not Gemini)

- Promoting the proxy-not-DOM design and the `duration` fallback chain from code comments into a real Brief 2 addendum — this is a documentation decision for Chahya, not a code change.
- Reviewing `motionEngine.js`, `pathUtils.js`, `projection3d.js`, `validateScenario.js` — no brief exists for these yet. `validateScenario.js` appears to have a real bug (fake single-scenario project wrapper causes false-positive `perspective-usage` warnings), but fixing it before a spec exists risks guessing at intent — hold until a brief or design note is written.
