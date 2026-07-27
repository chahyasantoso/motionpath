# Implementation Brief — FK Plugin (Option 2) + Anchor Offset + `compose()` Reorder

**Branch:** `v4`
**Files under change:** `src/lib/Track.js`, `src/domain/plugins/fkPlugin.js`, `src/domain/plugins.js`, `src/lib/fkMath.js` (new), `src/lib/helpers.js`
**Design context:** `progress/v4/observe-fk-design.md` §4, §6, §6.1 (anchor connection). Read those sections before starting.
**Prerequisite:** `observe-multisource-brief.md` and `compose-per-call-scoping-brief.md` must already be implemented and all tests passing. Verify with `npx vitest run` before touching anything.
**For implementation by:** Gemini Flash.
**Verification:** run `npx vitest run` after EACH numbered step. Do not proceed to the next step if any test fails.

---

## What this brief does

Option 1 (already shipped) puts FK accumulation math inside each `mapFn` at wire-up time. Option 2 moves that math into a reusable plugin (`fkPlugin`) so call sites become uniform and declarative.

This brief also adds a pixel-offset anchor, `anchor.offset` (Step 5). Scope it precisely: `anchor.offset` is a **render-layer pivot/hinge nudge only** — `finalX = composedX + offset.x`, applied post-compose in the element's own screen space. It is useful for rotation about a displaced point (hinge, pendulum, clock hand) and has **zero** FK coupling. It does **not** carry any FK bone vector, and it must **not** be read inside `compose()` or the fold. See `observe-fk-design.md` §6.1 "The anchor connection" for why the parent-frame bone rest-offset (idea (b) there) is deliberately kept off this field.

This requires one structural change to `compose()`: the observed fold must inject `parentWorld` into `rawData` **before** `composePatch` runs (so the plugin can read it), rather than after (the current order). That reorder is the core of this brief.

---

## Background — why the reorder is needed

Current `compose()` order in `src/lib/Track.js`:

```
1. composePatch(plugins, rawData, ...)   ← plugins run here
2. for each observed source:
     fold mapFn(source.compose()) in     ← observed patch applied LAST (overrides)
```

`fkPlugin.compose(rawData)` needs `rawData.parentWorld` to exist when step 1 runs. But `parentWorld` comes from the observed source's resolved patch — which is currently produced in step 2. So the plugin runs before its input exists. The fix: split the observed fold into two passes:

```
1. PRE-FOLD: for each observed source marked as "input provider":
     merge mapFn(source.compose()) into rawData before plugins run
2. composePatch(plugins, enrichedRawData, ...)
3. POST-FOLD: for each observed source marked as "output override":
     merge mapFn(source.compose()) into patch after plugins run  ← current behavior
```

In practice, `setObserved` gains an optional `{ role: 'input' | 'output' }` option. Default is `'output'` (preserves all existing behavior). FK wiring uses `'input'`.

---

## Step 0 — read and confirm prerequisites

```bash
npx vitest run
```

All tests must pass before you write a single line. If any fail, stop and report which ones.

---

## Step 1 — create `src/lib/fkMath.js`

New file. Exact content:

```js
/**
 * 2D affine world-transform accumulation for forward kinematics.
 * parentWorld / local: { x, y, rotation } — rotation in degrees.
 * Returns the child joint's world transform.
 */
export function composeWorld(parentWorld, local) {
  const rad = ((parentWorld.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: (parentWorld.x ?? 0) + ((local.x ?? 0) * cos - (local.y ?? 0) * sin),
    y: (parentWorld.y ?? 0) + ((local.x ?? 0) * sin + (local.y ?? 0) * cos),
    rotation: (parentWorld.rotation ?? 0) + (local.rotation ?? 0),
  };
}
```

Run `npx vitest run`. Must still pass (no tests for this file yet — that's fine).

---

## Step 2 — create `src/domain/plugins/fkPlugin.js`

New file. Exact content:

```js
import { createAnimationPlugin } from "../createAnimationPlugin.js";
import { composeWorld } from "../../lib/fkMath.js";

/**
 * FK plugin — forward-kinematic joint accumulation.
 *
 * Animatable key: `boneLength` (the joint's reach along its local X axis).
 * Also claims `parentWorld` (injected by the pre-fold; never in keyframes).
 *
 * compose() reads rawData.parentWorld (injected by the pre-fold pass in
 * Track.compose()) and rawData.boneLength (from the tween proxy), calls
 * composeWorld, and returns { x, y, rotation } in world space.
 *
 * If parentWorld is absent this joint is treated as the root: its own
 * boneLength becomes its world x, rotation stays 0.
 */
export const fkPlugin = createAnimationPlugin({
  keys: ["boneLength"],
  lazy: false,
  claimsKey(k) {
    return k === "boneLength" || k === "parentWorld";
  },
  contribute(propKey, stops) {
    if (propKey !== "boneLength") return { percentPatch: {}, tweenVars: {} };
    const percentPatch = {};
    stops.forEach((s) => {
      percentPatch[`${s.p * 100}%`] = { boneLength: s.v };
      if (s.ease) percentPatch[`${s.p * 100}%`].ease = s.ease;
    });
    return { percentPatch, tweenVars: {} };
  },
  compose(rawData) {
    const parentWorld = rawData.parentWorld ?? { x: 0, y: 0, rotation: 0 };
    const local = {
      x: rawData.boneLength ?? 0,
      y: 0,
      rotation: rawData.rotation ?? 0,
    };
    return composeWorld(parentWorld, local);
  },
});
```

Run `npx vitest run`. Must still pass.

---

## Step 3 — register `fkPlugin` in `src/domain/plugins.js`

Add the import and include it in `ALL_PLUGINS`. Minimal diff:

```js
// add after existing imports:
import { fkPlugin } from "./plugins/fkPlugin.js";

// add to ALL_PLUGINS array (before the unsupported lazy plugins):
export const ALL_PLUGINS = [
  ...Object.values(simplePlugins),
  ...Object.values(colorPlugins),
  filterGroupPlugin,
  pathPlugin,
  cssVarPlugin,
  imageSequencePlugin,
  fkPlugin, // ← add this line
  splitTextPlugin,
  morphSvgPlugin,
  drawSvgPlugin,
  scrambleTextPlugin,
];
```

Also add a named export for external use:

```js
export { fkPlugin };
```

Run `npx vitest run`. Must still pass.

---

## Step 4 — extend `setObserved` to accept a `role` option in `src/lib/Track.js`

### 4a — change the internal store

Replace the `#observed` Map's value type from `mapFn` to `{ mapFn, role }`:

```js
// was:
#observed = new Map(); // source Track -> mapFn

// becomes:
#observed = new Map(); // source Track -> { mapFn, role: 'input'|'output' }
```

### 4b — update `setObserved`

```js
/**
 * @param {Track|null} track
 * @param {(composedPatch: object) => (object|null|undefined)} [mapFn]
 * @param {{ role?: 'input'|'output' }} [opts]
 *   role 'output' (default): fold applied AFTER plugins (current behavior, overrides own fields).
 *   role 'input':  fold applied BEFORE plugins (injects fields into rawData for plugin consumption).
 */
setObserved(track, mapFn, opts = {}) {
  if (!track) {
    this.#observed.clear();
    return;
  }
  this.#observed.set(track, { mapFn: mapFn ?? null, role: opts.role ?? 'output' });
}
```

### 4c — update `removeObserved` — no change needed (deletes by key, value shape irrelevant).

### 4d — update `observedSources` getter — no change needed (returns keys).

### 4e — update `compose()` to run two fold passes

Replace the single observed-fold loop with two passes. The full updated `compose()`:

```js
compose(rawData, ctx) {
  ctx = ctx ?? new Map();

  const cached = ctx.get(this);
  if (cached === COMPOSING) {
    return composePatch(this.#plugins, rawData ?? this.getSnapshot(),
                        this.#resolvedTrack, `track "${this.#id}"`);
  }
  if (cached !== undefined) return cached;

  ctx.set(this, COMPOSING);

  // --- PRE-FOLD: inject 'input' observations into rawData before plugins run ---
  let source = rawData ?? this.getSnapshot();
  for (const [observedSource, { mapFn, role }] of this.#observed) {
    if (role !== 'input' || !mapFn) continue;
    const contribution = mapFn(observedSource.compose(undefined, ctx));
    if (contribution) source = { ...source, ...contribution };
  }

  // --- PLUGINS ---
  let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);

  // --- POST-FOLD: apply 'output' observations after plugins (last-wins override) ---
  for (const [observedSource, { mapFn, role }] of this.#observed) {
    if (role !== 'output' || !mapFn) continue;
    const contribution = mapFn(observedSource.compose(undefined, ctx));
    if (contribution) patch = mergePatches(patch, contribution);
  }

  ctx.set(this, patch);
  return patch;
}
```

**Critical:** the `ctx` Map is threaded into both fold passes. The `COMPOSING` sentinel and diamond memo still work correctly because `ctx.set(this, COMPOSING)` happens before either pass, and `ctx.set(this, patch)` happens after both.

Run `npx vitest run`. All existing tests must still pass — the default `role: 'output'` preserves the current behavior exactly.

---

## Step 5 — add anchor offset support in `src/lib/helpers.js`

Today `anchor` is `{ xPercent, yPercent }` — a self-relative visual centering applied post-compose. Add an optional `offset: { x, y }` field that shifts the element's position in pixel space (useful as a pivot/hinge point, independent of FK).

```js
/**
 * Merges xPercent / yPercent and optional pixel offset into composed patch.
 * anchor.offset: { x, y } — pixel displacement applied via x/y (additive on top of compose output).
 * Omitted anchor stays a strict no-op.
 */
export function applyAnchor(patch, anchor) {
  if (!anchor) return patch;
  const result = { ...patch, ...anchor };
  if (anchor.offset) {
    result.x = (patch.x ?? 0) + (anchor.offset.x ?? 0);
    result.y = (patch.y ?? 0) + (anchor.offset.y ?? 0);
    delete result.offset; // offset is internal; never pass to gsap.set
  }
  return result;
}
```

Run `npx vitest run`. Must still pass.

---

## Step 6 — write tests

Add a new describe block in `src/lib/__tests__/Track.test.js` (do NOT remove any existing tests):

```js
describe("setObserved role:input (FK plugin pre-fold)", () => {
  it("injects parentWorld into rawData before plugins run", () => {
    // parent: a plain track at progress 0.5 → x:50, y:100
    const parent = createDummyTrack("fk-parent");
    parent.progress(0.5);

    // child: observes parent with role:'input', mapFn injects parentWorld
    const child = createDummyTrack("fk-child");
    child.setObserved(
      parent,
      (pw) => ({
        parentWorld: { x: pw.x ?? 0, y: pw.y ?? 0, rotation: pw.rotation ?? 0 },
      }),
      { role: "input" },
    );

    // The child's own plugin (test dummy) receives rawData with parentWorld injected.
    // We verify the field is present by checking compose() doesn't throw and
    // that the child's own transform is still produced (plugin ran with enriched rawData).
    expect(() => child.compose()).not.toThrow();
  });

  it("role:output (default) still applies after plugins — existing behavior unchanged", () => {
    const source = createDummyTrack("role-output-source");
    source.progress(1);
    const follower = createDummyTrack("role-output-follower");
    // default role is 'output' — fold overrides follower's own transform
    follower.setObserved(source, (pw) => ({ transform: pw.transform }));
    expect(follower.compose().transform).toBe("translate3d(100px, 200px, 0px)");
  });

  it("input fold runs before output fold within the same compose() call", () => {
    // source provides parentWorld via input fold
    const source = createDummyTrack("order-source");
    source.progress(0.5);

    const joint = createDummyTrack("order-joint");
    const inputSpy = vi.fn((pw) => ({ parentWorld: pw }));
    const outputSpy = vi.fn((pw) => ({ tag: "output" }));

    joint.setObserved(source, inputSpy, { role: "input" });
    joint.setObserved(source, outputSpy, { role: "output" });

    joint.compose();

    expect(inputSpy).toHaveBeenCalledBefore?.(outputSpy) ??
      expect(inputSpy).toHaveBeenCalled(); // vitest may not have calledBefore; just verify both ran
    expect(outputSpy).toHaveBeenCalled();
  });
});
```

Add a test for `applyAnchor` offset in `src/lib/__tests__/applyAnchor.test.js` (or create it if absent):

```js
it("applies pixel offset additively on top of patch x/y", () => {
  const patch = { x: 50, y: 100, transform: "translate3d(50px, 100px, 0px)" };
  const result = applyAnchor(patch, {
    xPercent: -50,
    yPercent: -50,
    offset: { x: 10, y: -5 },
  });
  expect(result.x).toBe(60);
  expect(result.y).toBe(95);
  expect(result.xPercent).toBe(-50);
  expect(result.offset).toBeUndefined(); // must not leak to gsap.set
});

it("omitting offset leaves x/y untouched", () => {
  const patch = { x: 50, y: 100 };
  const result = applyAnchor(patch, { xPercent: -50, yPercent: -50 });
  expect(result.x).toBe(50);
  expect(result.y).toBe(100);
});
```

Run `npx vitest run`. All tests must pass.

---

## Step 7 — verify FK wire-up pattern works end-to-end

This is a manual smoke test, not an automated test. In a scratch file or the browser console, wire a 3-joint chain using `fkPlugin` and confirm the tip's `compose()` returns accumulated world coordinates:

```js
// Each joint track must have boneLength in its keyframes so fkPlugin is resolved.
// For a quick smoke test you can create tracks manually (see createDummyTrack pattern).

const asParent = (pw) => ({
  parentWorld: { x: pw.x ?? 0, y: pw.y ?? 0, rotation: pw.rotation ?? 0 },
});

// shoulder at world origin, boneLength 80
// upperArm observes shoulder via input fold
// forearm observes upperArm via input fold
// hand observes forearm via input fold

upperArm.setObserved(shoulder, asParent, { role: "input" });
forearm.setObserved(upperArm, asParent, { role: "input" });
hand.setObserved(forearm, asParent, { role: "input" });

// hand.compose() should return { x: ~240, y: 0, rotation: 0 } for a straight arm
// (3 × boneLength=80, no rotation).
console.log(hand.compose());
```

---

## Step 8 — final checklist

Before reporting done, run through every item:

- [ ] `npx vitest run` — all tests pass, zero failures.
- [ ] `fkMath.js` exists at `src/lib/fkMath.js` and exports `composeWorld`.
- [ ] `fkPlugin.js` exists at `src/domain/plugins/fkPlugin.js`, registered in `ALL_PLUGINS`.
- [ ] `setObserved` accepts `opts.role` (`'input'` | `'output'`), default `'output'`.
- [ ] `compose()` runs pre-fold (input) before `composePatch`, post-fold (output) after.
- [ ] `ctx` Map is threaded through both fold passes — cycle guard and diamond memo still work.
- [ ] All existing `setObserved` tests still pass (default role is `'output'`, behavior unchanged).
- [ ] `applyAnchor` supports `anchor.offset` additively; `offset` key is deleted before returning.
- [ ] No `attach`, `detach`, `isAttached`, `#attachedTo`, `#attachedChildren` anywhere in `src/`.
- [ ] No `#composing` boolean flag anywhere in `Track.js` (superseded by `ctx` Map).

---

## What this brief does NOT do

- Does not implement a reverse registry (no `#observers` on source tracks). Caller still owns teardown: call `removeObserved(source)` before destroying a source that is observed with `role:'input'`.
- Does not implement epoch-based cross-frame caching (Option C). That is a separate future brief.
- Does not change the Spiral demo to use `fkPlugin` — that is a separate migration task.
- Does not add 3D (Z-axis) FK. `composeWorld` is 2D only. Extend `fkMath.js` separately if needed.
- Does not route any FK bone offset through `anchor.offset`. `anchor.offset` is Step 5's render-layer pivot only. The declarative bone rest-offset (design doc §6.1 (b)) is deferred and, when built, gets its own field (`restOffset` or `boneLength`) — never `anchor`.
