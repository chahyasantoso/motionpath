# MotionPath — Fix Note: `path-shape` Validator Correction

**Status:** One rule, stale since before implementation began. Standalone — implement against this only.

**Scope: exactly two files.** `validators/rules/path-shape.js` and `validators/rules/__tests__/path-shape.test.js`. Nothing else changes — not `pathPlugin.js`, not `pathUtils.js`, not the orchestrator, not any other rule.

---

## Problem

`path-shape.js` currently validates `element.keyframes.path.points` as if it were a final cubic Bézier array (`(points.length - 1) % 3 === 0 && points.length >= 4`). That assumption is wrong as of the current implementation: `pathPlugin.js`'s `contribute()` already accepts raw waypoints (`{x, y, z?, ctrlX?, ctrlY?, ctrlZ?}`) and converts them internally via `convertToCubicPath()` at build time. The validator was never updated to match, so it currently rejects the correct authoring format and would silently accept an already-converted cubic array instead — which, if it ever reached the plugin, would be converted a second time and produce a wrong curve.

## Fix — replace the entire function body

```js
/**
 * Rule: path-shape
 * Validates the raw waypoint array authors provide for `path.points`.
 * `points` is NOT a pre-converted cubic Bézier array — pathPlugin.js converts
 * internally via convertToCubicPath() at build time. This rule validates the
 * input to that conversion, not its output.
 *
 * @param {unknown} element
 * @param {unknown} scenario
 * @param {{ schema: unknown }} context
 * @param {string} path - JSON path to element
 * @returns {ValidationError[]}
 */
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

    if (typeof pt?.x !== 'number' || typeof pt?.y !== 'number') {
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
        message: "ctrlX/ctrlY on the first path point have no effect (no preceding segment to curve).",
        path: ptPath,
      });
    }
  });

  return errors;
}
```

**Do not also re-add a `stops[].v` range check here if one existed before under a different name** — that check belongs to whichever rule already owns `path.stops` validation; this rule now only concerns `points`. If the old `v ∈ [0,1]` check was living inside this same function, move it out to wherever it's actually specified, don't delete it outright — but do not duplicate it here either.

## Replace the existing test file's cases entirely

The old cubic-chain test cases (`points.length` divisible-by-3-plus-1 checks) are for a shape this rule no longer validates — delete them. Replace with:

```js
it('errors when fewer than 2 points are given', () => {
  const element = { keyframes: { path: { points: [{ x: 0, y: 0 }] } } };
  const errors = pathShapeRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
  expect(errors.some(e => e.severity === 'error')).toBe(true);
});

it('accepts the minimum valid path (2 plain waypoints)', () => {
  const element = { keyframes: { path: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] } } };
  const errors = pathShapeRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
  expect(errors.length).toBe(0);
});

it('errors when only one of ctrlX/ctrlY is provided', () => {
  const element = { keyframes: { path: { points: [
    { x: 0, y: 0 }, { x: 10, y: 10, ctrlX: 5 },
  ] } } };
  const errors = pathShapeRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
  expect(errors.some(e => e.severity === 'error')).toBe(true);
});

it('warns when ctrlX/ctrlY are given on the first point', () => {
  const element = { keyframes: { path: { points: [
    { x: 0, y: 0, ctrlX: 1, ctrlY: 1 }, { x: 10, y: 10 },
  ] } } };
  const errors = pathShapeRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
  expect(errors.some(e => e.severity === 'warning')).toBe(true);
  expect(errors.some(e => e.severity === 'error')).toBe(false);
});

it('errors on non-numeric x/y', () => {
  const element = { keyframes: { path: { points: [
    { x: 'a', y: 0 }, { x: 1, y: 1 },
  ] } } };
  const errors = pathShapeRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
  expect(errors.some(e => e.severity === 'error')).toBe(true);
});

it('returns no errors when path is absent', () => {
  const element = { keyframes: { x: { stops: [{ p: 0, v: 0 }] } } };
  const errors = pathShapeRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
  expect(errors.length).toBe(0);
});
```

## Verification checklist

- `path-shape.js` contains no reference to `% 3` or any cubic-chain-length arithmetic.
- The full validator suite still passes with `DemoPage.jsx`'s `rocket-track` element (2–3 raw waypoints, one with `ctrlX`/`ctrlY`) producing zero errors.
- Re-running `validateProject` against any existing scenario that previously failed only because of the stale cubic-chain check now passes (assuming no other unrelated errors exist in that scenario).
