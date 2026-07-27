# Implementation Brief — Multi-Source `setObserved`, delete `attach`/`detach`

**Branch:** `v4`
**File under change:** `src/lib/Track.js` (plus one new file, plus test updates)
**Design context:** `progress/v4/observe-fk-design.md` — read section 2 (recursion), 3 (multi-source),
5 (Option 1). This brief implements **Option 1 and Option A only.** Do NOT implement Option 2 or
Option C (epoch memo) — they are future work with their own briefs.
**For implementation by:** Gemini Flash.
**Verification:** run `npx vitest run` after EACH step. Do not trust your own summary — re-run the
checklist at the bottom before reporting done.

---

## What you are doing, in one paragraph

`Track` currently has THREE ways to combine tracks: `attach`/`detach` (host pulls children),
single-source `setObserved` (observer folds one source, reads `getSnapshot()`), and `addChild`
(layout — leave this ALONE). You will: (1) delete `attach`/`detach` entirely; (2) make
`setObserved` hold MANY sources in a Map; (3) change the fold to read `source.compose()` instead
of `source.getSnapshot()`; (4) add a re-entrancy guard so cycles don't stack-overflow; (5) add a
new `fkMath.js` helper file. Do NOT touch `addChild`/`removeChild`/`LayoutDelegate` — that is a
separate axis.

Implement the steps IN ORDER. Commit each step separately. Do not combine commits.

---

## Step 1 — Add the re-entrancy guard field and rewrite `compose()`

**File:** `src/lib/Track.js`

### 1a. Replace the observation fields

Find these two lines (around line 39-40):

```js
  #observedSource = null;
  #observedMapFn = null;
```

Replace with:

```js
  #observed = new Map(); // source Track -> mapFn (insertion order = fold order)
  #composing = false;    // re-entrancy guard for cycle-safe compose()
```

### 1b. Rewrite `compose()`

Find the current `compose()` method (around line 95-108):

```js
  compose(rawData) {
    const source = rawData ?? this.getSnapshot();
    let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
    for (const child of this.#attachedChildren) {
      patch = mergePatches(patch, child.compose());
    }
    if (this.#observedSource && this.#observedMapFn) {
      const observedPatch = this.#observedMapFn(this.#observedSource.getSnapshot());
      if (observedPatch) {
        patch = mergePatches(patch, observedPatch);
      }
    }
    return patch;
  }
```

Replace the WHOLE method with:

```js
  compose(rawData) {
    const source = rawData ?? this.getSnapshot();

    // Cycle back-edge: we are being composed while already mid-compose higher
    // in the stack. Do NOT recurse into observed sources — return only this
    // track's own local (plugin-only) patch. See observe-fk-design.md §2.
    if (this.#composing) {
      return composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
    }

    this.#composing = true;
    try {
      let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
      // Fold each observed source in insertion order; each mapped patch applies
      // LAST (last-wins), so it can override this track's own fields.
      // NOTE: mapFn receives the source's COMPOSED patch, not its snapshot.
      for (const [observedSource, mapFn] of this.#observed) {
        if (!mapFn) continue;
        const observedPatch = mapFn(observedSource.compose());
        if (observedPatch) {
          patch = mergePatches(patch, observedPatch);
        }
      }
      return patch;
    } finally {
      this.#composing = false;
    }
  }
```

**Important details you must not change:**

- The back-edge branch returns `composePatch(...)` on `source` — the SAME first argument used in
  the main path. Do not return `{}` or `getSnapshot()` raw.
- The `finally` is mandatory. If `mapFn` throws, the flag MUST still reset.
- `mapFn(observedSource.compose())` — `.compose()`, NOT `.getSnapshot()`. This is the whole point
  of the change.

Run `npx vitest run`. Expect FAILURES in `Track.test.js` for the old `setObserved`/`attach` tests
— that is expected; Steps 2-4 fix them.

---

## Step 2 — Rewrite `setObserved`, add `removeObserved`, update the getter

**File:** `src/lib/Track.js`

Find the current `setObserved` method and its big JSDoc block (around line 110-140), plus the
`get observedSource()` getter. Replace the JSDoc + `setObserved` + getter with:

```js
  /**
   * Multi-source FK / read-only cross-track observation. On every compose(),
   * for each observed source, pulls source.compose() (its fully-resolved patch)
   * and folds mapFn(composedPatch) into this track's own composed patch, applied
   * LAST in insertion order (so it can override this track's own fields).
   *
   * Reads source.compose() — the RESOLVED world state, so FK chains accumulate.
   * Cycles are made safe by the #composing re-entrancy guard in compose(), not
   * by reading a raw snapshot. See observe-fk-design.md §2, §3.
   *
   * - setObserved(track, mapFn): add or REPLACE the observation of `track`.
   * - setObserved(null): clear ALL observations.
   * - removeObserved(track): drop one source.
   *
   * No lifecycle coupling, no ownership. If an observed source is destroyed, the
   * CALLER — not Track — must removeObserved(source) (or setObserved(null))
   * BEFORE destroying it. Track holds no reverse registry.
   *
   * @param {Track|null} track - source to observe, or null to clear all
   * @param {(composedPatch: object) => (object|null|undefined)} [mapFn]
   */
  setObserved(track, mapFn) {
    if (!track) {
      this.#observed.clear();
      return;
    }
    this.#observed.set(track, mapFn ?? null);
  }

  removeObserved(track) {
    this.#observed.delete(track);
  }

  get observedSources() {
    return Array.from(this.#observed.keys());
  }
```

**Note:** the old getter was `observedSource` (singular). It is now `observedSources` (plural,
returns an array). This is a deliberate API change.

---

## Step 3 — Delete `attach`/`detach` and the attachment machinery

**File:** `src/lib/Track.js`

### 3a. Delete the fields

Find and DELETE these two lines (around line 31-32):

```js
  #attachedTo = null;
  #attachedChildren = new Set();
```

### 3b. Delete the `subscribe` attachment guard

Find the current `subscribe` method (around line 142-153). It starts with an `if (this.#attachedTo)`
throw. Replace the WHOLE method with this (guard removed):

```js
  subscribe(cb) {
    this.#subscribers.add(cb);
    cb(this.getSnapshot());
    return () => {
      this.#subscribers.delete(cb);
    };
  }
```

### 3c. Delete the attach/detach/isAttached block

Find and DELETE this entire block (around line 178-196):

```js
  // --- Cross-track merge: "living together" ---
  attach(host) {
    if (this.#attachedTo) {
      throw new Error(`Track "${this.#id}" already attached to "${this.#attachedTo.id}"`);
    }
    this.#attachedTo = host;
    host.#attachedChildren.add(this);
  }

  detach(host) {
    if (this.#attachedTo === host) {
      this.#attachedTo = null;
      host.#attachedChildren.delete(this);
    }
  }

  get isAttached() {
    return this.#attachedTo !== null;
  }
```

### 3d. Update `destroy()`

Find `destroy()` (around line 237). It currently sets `#observedSource`/`#observedMapFn` to null.
Replace those two lines with a single Map clear:

```js
  destroy() {
    this.#subscribers.clear();
    this.#observed.clear();
    try {
      this.#interpolationTimeline?.kill();
    } catch (e) {
      /* ignore */
    }
  }
```

After this step, `grep -n "attach\|#observedSource\|#observedMapFn" src/lib/Track.js` must return
NOTHING except possibly comments. If any live reference remains, you missed one.

---

## Step 4 — Add `fkMath.js`

**New file:** `src/lib/fkMath.js`

```js
/**
 * 2D affine forward-kinematic accumulation.
 * A joint's world transform = parent's world transform composed with the
 * joint's own local transform. See observe-fk-design.md §4.
 *
 * @param {{x:number,y:number,rotation:number}} parentWorld - resolved parent world transform (rotation in degrees)
 * @param {{x:number,y:number,rotation:number}} local - this joint's local transform (rotation in degrees)
 * @returns {{x:number,y:number,rotation:number}}
 */
export function composeWorld(parentWorld, local) {
  const rad = (parentWorld.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: parentWorld.x + (local.x * cos - local.y * sin),
    y: parentWorld.y + (local.x * sin + local.y * cos),
    rotation: parentWorld.rotation + local.rotation,
  };
}
```

Do NOT wire this into `Track.js`. It is a standalone helper used by application code (mapFns).
This step is just adding the file.

---

## Step 5 — Fix the tests

**File:** `src/lib/__tests__/Track.test.js`

### 5a. DELETE the attach test

Delete this entire test (around line 64-76), because `attach`/`detach`/`isAttached` no longer exist:

```js
  it('should enforce single attachment guard and throw on subscribe if attached', () => {
    ...
  });
```

### 5b. Rewrite the `setObserved` describe block

The existing `describe('setObserved ...')` block asserts the OLD behavior: mapFn receiving
`getSnapshot()` (raw values) and the cycle test expecting raw `0`. Under the new design, mapFn
receives `source.compose()` (the composed patch). Replace the ENTIRE
`describe('setObserved (FK-chaining / read-only cross-track observation)', ...)` block with:

```js
describe("setObserved (multi-source FK / read-only cross-track observation)", () => {
  it("folds mapFn(observed.compose()) into compose() output", () => {
    const source = createDummyTrack("source");
    source.progress(0.5); // composed: translate3d(50px, 100px, 0px)

    const follower = createDummyTrack("follower");
    follower.setObserved(source, (composed) => ({
      observedTransform: composed.transform,
    }));

    const out = follower.compose();
    expect(out.observedTransform).toBe("translate3d(50px, 100px, 0px)");
    // follower's own composed transform is still present (fold is additive)
    expect(out.transform).toBe("translate3d(0px, 0px, 0px)");
  });

  it("folded patch is applied last and can override the observer's own fields", () => {
    const source = createDummyTrack("source2");
    source.progress(1); // composed: translate3d(100px, 200px, 0px)

    const follower = createDummyTrack("follower2");
    follower.setObserved(source, (composed) => ({
      transform: composed.transform,
    }));

    // follower's own progress is 0, but the fold overrides transform entirely.
    expect(follower.compose().transform).toBe("translate3d(100px, 200px, 0px)");
  });

  it("is cycle-safe: mutual observation resolves synchronously without stack overflow", () => {
    const a = createDummyTrack("cycle-a");
    const b = createDummyTrack("cycle-b");
    a.setObserved(b, (composed) => ({ fromB: composed.transform }));
    b.setObserved(a, (composed) => ({ fromA: composed.transform }));

    // Must not throw / hang. The back-edge returns the plugin-only patch.
    expect(() => a.compose()).not.toThrow();
    expect(() => b.compose()).not.toThrow();
    const outA = a.compose();
    expect(outA.fromB).toBe("translate3d(0px, 0px, 0px)");
  });

  it("holds multiple sources and folds them in insertion order (last wins)", () => {
    const s1 = createDummyTrack("s1");
    const s2 = createDummyTrack("s2");
    s1.progress(0.5); // 50/100
    s2.progress(1); // 100/200

    const follower = createDummyTrack("multi-follower");
    follower.setObserved(s1, () => ({ tag: "s1" }));
    follower.setObserved(s2, () => ({ tag: "s2" }));

    // s2 folded after s1, last-wins.
    expect(follower.compose().tag).toBe("s2");
    expect(follower.observedSources).toHaveLength(2);
  });

  it("setObserved(track) again replaces that source's mapFn without throwing", () => {
    const source = createDummyTrack("replace-source");
    const follower = createDummyTrack("replace-follower");
    follower.setObserved(source, () => ({ tag: "first" }));
    expect(() =>
      follower.setObserved(source, () => ({ tag: "second" })),
    ).not.toThrow();
    expect(follower.compose().tag).toBe("second");
    expect(follower.observedSources).toHaveLength(1); // replaced, not duplicated
  });

  it("removeObserved(track) drops one source; setObserved(null) clears all", () => {
    const s1 = createDummyTrack("rm1");
    const s2 = createDummyTrack("rm2");
    const follower = createDummyTrack("rm-follower");
    follower.setObserved(s1, () => ({ a: 1 }));
    follower.setObserved(s2, () => ({ b: 2 }));

    follower.removeObserved(s1);
    expect(follower.observedSources).toEqual([s2]);

    follower.setObserved(null);
    expect(follower.observedSources).toHaveLength(0);
    expect(follower.compose().b).toBeUndefined();
  });

  it("omitting mapFn is a safe no-op fold, does not crash compose()", () => {
    const source = createDummyTrack("no-mapfn-source");
    const follower = createDummyTrack("no-mapfn-follower");
    follower.setObserved(source);
    expect(() => follower.compose()).not.toThrow();
  });
});
```

### 5c. Add an fkMath test

**New file:** `src/lib/__tests__/fkMath.test.js`

```js
import { describe, it, expect } from "vitest";
import { composeWorld } from "../fkMath.js";

describe("composeWorld", () => {
  it("translates in the parent frame when parent has no rotation", () => {
    const out = composeWorld(
      { x: 10, y: 5, rotation: 0 },
      { x: 80, y: 0, rotation: 0 },
    );
    expect(out.x).toBeCloseTo(90);
    expect(out.y).toBeCloseTo(5);
    expect(out.rotation).toBe(0);
  });

  it("rotates the local offset into a rotated parent frame", () => {
    // parent rotated 90deg: local +x maps to +y
    const out = composeWorld(
      { x: 0, y: 0, rotation: 90 },
      { x: 80, y: 0, rotation: 0 },
    );
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(80);
  });

  it("accumulates rotation additively", () => {
    const out = composeWorld(
      { x: 0, y: 0, rotation: 30 },
      { x: 0, y: 0, rotation: 15 },
    );
    expect(out.rotation).toBe(45);
  });
});
```

---

## Step 6 — Check for other callers of the removed API

Run these greps. If ANY hit shows up in `src/` (outside test files and outside `Track.js`
itself), STOP and report it — do not blind-edit application code without checking the design:

```bash
grep -rn "\.attach(\|\.detach(\|\.isAttached\|\.observedSource\b" src --include=*.js --include=*.jsx
```

Expected: nothing outside the changes you already made. `observedSources` (plural) is fine.
If a real caller of `.attach(`/`.detach(` exists in app code, it must migrate to `setObserved`,
but that is OUT OF SCOPE for this brief — report it, don't fix it here.

---

## Verification checklist (run ALL before reporting done)

1. `npx vitest run` — all tests pass. The Track suite count changes (one attach test removed,
   several setObserved tests rewritten, new multi-source + fkMath tests added). No FAILURES.
2. `grep -n "attach\|detach\|#observedSource\|#observedMapFn\|#attachedChildren\|#attachedTo" src/lib/Track.js`
   — returns NOTHING (no live references; stray comment mentions are acceptable only if they
   don't reference deleted symbols).
3. `grep -n "getSnapshot()" src/lib/Track.js` — the fold inside `compose()` must NOT call
   `getSnapshot()` on observed sources. `getSnapshot()` should appear only in its own method
   definition, in `subscribe`, and as the `rawData ?? this.getSnapshot()` default. It must NOT
   appear in the observed-source loop.
4. `compose()` contains `this.#composing = true;` inside a `try` with a matching
   `finally { this.#composing = false; }`. Confirm the `finally` exists.
5. The observed loop calls `observedSource.compose()`, NOT `.getSnapshot()`.
6. `src/lib/fkMath.js` exists and exports `composeWorld`.
7. Full diff review: only `src/lib/Track.js`, `src/lib/fkMath.js`,
   `src/lib/__tests__/Track.test.js`, and `src/lib/__tests__/fkMath.test.js` changed. NOTHING
   else. If `addChild`, `removeChild`, `LayoutDelegate`, or any file outside this list appears in
   the diff, back it out — this brief does not touch layout/composition-children.

---

## Things you must NOT do (scope guard)

- Do NOT implement the epoch memo / `gsap.ticker.frame` cache (Option C). The guard is Option A only.
- Do NOT implement the FK plugin (Option 2) or reorder `compose()`'s fold.
- Do NOT touch `addChild`/`removeChild`/`#children`/`#parent`/`LayoutDelegate` — different axis.
- Do NOT add offset-anchor behavior — that lands with Option 2.
- Do NOT migrate the Spiral demo — it is a separate task.
- If you find app code that calls `.attach(`/`.detach(`, REPORT it; do not migrate it here.
