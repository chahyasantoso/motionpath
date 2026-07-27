# Implementation Brief — Per-Call Compose Scoping (replaces Option A's boolean guard)

**Branch:** `v4`
**File under change:** `src/lib/Track.js` (plus test updates only)
**Design context:** `progress/v4/observe-fk-design.md` §2 (Option A, shipped) and §2 (Option C,
explicitly deferred). This brief supersedes **only** the `#composing` boolean guard from the
already-shipped `observe-multisource-brief.md` — it does **not** touch fold order, `setObserved`,
`removeObserved`, or `fkMath.js`, all of which stay exactly as they are today.
**For implementation by:** Gemini Flash.
**Verification:** run `npx vitest run` after each step. Re-run the checklist at the bottom before
reporting done.

---

## What you are doing, in one paragraph

`Track.compose()` currently uses a single boolean field (`#composing`) to stop infinite recursion
on observation cycles. That guard is correct but leaves a real gap: if two tracks both observe a
shared third track (a "diamond" — B observes D, C observes D, A observes both B and C), D gets
recomposed once per path into it, not once per `compose()` call. On a wide/deep FK graph this is
exponential. You will replace the boolean guard with a `Map` (`ctx`) created fresh at the root of
every external `compose()` call and threaded down through the recursion as a second argument. The
`Map` does two jobs at once: it is the cycle guard (a sentinel value marks "in progress") **and**
a memo cache scoped to that single call (a finished node's patch is stored and reused if reached
again via a different path). Because `ctx` is a local variable that only lives for the duration of
one root call, there is **no cross-frame caching and therefore no invalidation problem** — this is
explicitly **not** Option C. Two `progress()` + `compose()` pairs in the same frame (scrubbing,
`seek`, synchronous tests) each get their own fresh `ctx` and recompute correctly.

Implement the steps IN ORDER. Commit each step separately. Do not combine commits.

---

## Step 1 — Remove the `#composing` field

**File:** `src/lib/Track.js`

Find (near the top of the class, alongside `#observed`):

```js
  #observed = new Map(); // source Track -> mapFn (insertion order = fold order)
  #composing = false;    // re-entrancy guard for cycle-safe compose()
```

Replace with:

```js
  #observed = new Map(); // source Track -> mapFn (insertion order = fold order)
```

(`#composing` is deleted outright — the guard moves into the per-call `ctx` Map in Step 2, so no
instance field is needed for it anymore.)

Add this module-level sentinel near the top of the file, alongside `clamp01`/`mergePatches`:

```js
// Per-call compose() sentinel: marks a track as "currently being resolved" within
// one root compose() call's ctx Map. See Step 2 below / compose-per-call-scoping-design.md.
const COMPOSING = Symbol("composing");
```

---

## Step 2 — Rewrite `compose()`

**File:** `src/lib/Track.js`

Find the current method:

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

Replace the WHOLE method with:

```js
  compose(rawData, ctx) {
    ctx = ctx ?? new Map(); // fresh scope per external (root) call; never persists past it

    const source = rawData ?? this.getSnapshot();

    const cached = ctx.get(this);

    // Cycle back-edge: this track is already being resolved higher in the
    // current call's recursion. Do NOT recurse into observed sources again —
    // return only this track's own local (plugin-only) patch, same fallback
    // as the original guard. See observe-fk-design.md §2.
    if (cached === COMPOSING) {
      return composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
    }

    // Diamond memo hit: this track was already fully resolved earlier in this
    // SAME call (reached via a different path). Reuse it instead of recomputing.
    if (cached !== undefined) {
      return cached;
    }

    ctx.set(this, COMPOSING);
    let patch = composePatch(this.#plugins, source, this.#resolvedTrack, `track "${this.#id}"`);
    // Fold each observed source in insertion order; each mapped patch applies
    // LAST (last-wins), so it can override this track's own fields.
    // NOTE: mapFn receives the source's COMPOSED patch, not its snapshot.
    for (const [observedSource, mapFn] of this.#observed) {
      if (!mapFn) continue;
      const observedPatch = mapFn(observedSource.compose(undefined, ctx)); // thread ctx down
      if (observedPatch) {
        patch = mergePatches(patch, observedPatch);
      }
    }
    ctx.set(this, patch);
    return patch;
  }
```

**Important details you must not change:**

- The back-edge branch returns `composePatch(...)` on `source` — identical fallback value to the
  original guard. Do not return `{}` or a raw snapshot.
- No `try`/`finally` is needed anymore. `ctx` is a local variable never stored on `this`, so if a
  `mapFn` throws mid-call, there is nothing to reset — the whole `ctx` is simply discarded with
  the call stack. This is a genuine simplification, not an oversight.
- `observedSource.compose(undefined, ctx)` — you MUST pass `ctx` as the second argument on this
  recursive call. Passing `rawData` here is always `undefined` (observed sources are always
  resolved from their own snapshot, never handed external `rawData`) — do not change this to pass
  something else.
- External callers (`useMotionSubscribers.js`, `helpers.js`, `SpiralBall.jsx`) all call
  `track.compose(raw)` with a single argument today. Do NOT change any of those call sites — `ctx`
  defaulting to `new Map()` when omitted is exactly what keeps this a clean drop-in for them.

Run `npx vitest run`. All existing `setObserved`/cycle tests should still pass unchanged — this
step does not change fold order or output values, only the recursion/caching mechanism.

---

## Step 3 — Update the `setObserved` JSDoc reference

**File:** `src/lib/Track.js`

Find this line inside the `setObserved` JSDoc block:

```
   * Cycles are made safe by the #composing re-entrancy guard in compose(), not
```

Replace with:

```
   * Cycles are made safe by the per-call ctx Map in compose() (COMPOSING sentinel +
   * diamond memo), not
```

(Keep the rest of that sentence — `by reading a raw snapshot. See observe-fk-design.md §2, §3.` —
unchanged.)

---

## Step 4 — Add a diamond-memoization test

**File:** `src/lib/__tests__/Track.test.js`

Add this test inside the existing `describe('setObserved (multi-source FK / read-only cross-track
observation)', ...)` block (append after the last `it(...)` in that block, before its closing
`});`):

```js
it("memoizes a diamond-shared source within a single compose() call", () => {
  const proxy = { x: 0, y: 0 };
  const tween = gsap.to(proxy, {
    x: 100,
    y: 200,
    duration: 1,
    ease: "none",
    paused: true,
  });
  const pluginComposeSpy = vi.fn((raw) => ({
    transform: `translate3d(${raw.x ?? 0}px, ${raw.y ?? 0}px, 0px)`,
  }));
  const d = new Track({
    id: "diamond-d",
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins: [{ keys: ["x", "y"], compose: pluginComposeSpy }],
    resolvedTrack: { id: "diamond-d", keyframes: { x: {}, y: {} } },
  });

  // b and c both observe d (the diamond's shared ancestor).
  const b = createDummyTrack("diamond-b");
  const c = createDummyTrack("diamond-c");
  b.setObserved(d, (composed) => ({ fromD: composed.transform }));
  c.setObserved(d, (composed) => ({ fromD: composed.transform }));

  // a observes both b and c, closing the diamond: a -> b -> d, a -> c -> d.
  const a = createDummyTrack("diamond-a");
  a.setObserved(b, (composed) => ({ fromB: composed.fromD }));
  a.setObserved(c, (composed) => ({ fromC: composed.fromD }));

  a.compose();

  // d's own plugin work must run exactly once per root compose() call, even
  // though d is reached via two different paths (b and c).
  expect(pluginComposeSpy).toHaveBeenCalledTimes(1);

  // A second, separate root call must recompute from scratch (no cross-call
  // caching) — this is what distinguishes per-call scoping from a persistent
  // cache and is what keeps it correct under scrubbing/seek.
  a.compose();
  expect(pluginComposeSpy).toHaveBeenCalledTimes(2);
});
```

---

## Step 5 — Check for other callers passing a second argument to `compose()`

Run this grep. If ANY hit shows a second argument being passed to `.compose(` outside `Track.js`
itself, STOP and report it — do not blind-edit application code:

```bash
grep -rn "\.compose(.*,.*)" src --include=*.js --include=*.jsx | grep -v "Track.js\|__tests__"
```

Expected: nothing (or only unrelated `.compose(trackId, data)` calls on the separate v3-style
`ProductionEngine`/`EditorEngine`/`MotionInstance` objects in `TowerDefensePage.jsx` — those are a
different class with a different method signature and are out of scope for this brief; confirm
they're on `.instance`/`.deathInstance`, not on a bare `Track`, and leave them alone).

---

## Verification checklist (run ALL before reporting done)

1. `npx vitest run` — all tests pass, including the new diamond-memoization test. No FAILURES.
2. `grep -n "#composing" src/lib/Track.js` — returns NOTHING. The field is fully removed.
3. `grep -n "const COMPOSING" src/lib/Track.js` — the module-level sentinel exists exactly once.
4. `compose()`'s signature is `compose(rawData, ctx)` — confirm both parameters are present.
5. `compose()` contains no `try`/`finally` block. (The old guard needed one; the new one doesn't —
   if you see a `finally` still present, you copied the old version by mistake.)
6. The observed-source loop calls `observedSource.compose(undefined, ctx)` — confirm `ctx` is
   passed as the second argument, not omitted.
7. Cache writes use `ctx.set(this, ...)` (twice: once with the `COMPOSING` sentinel before the
   fold, once with the final `patch` after it) and reads use `ctx.get(this)`.
8. Full diff review: only `src/lib/Track.js` and `src/lib/__tests__/Track.test.js` changed.
   Nothing in `fkMath.js`, `setObserved`/`removeObserved` bodies, fold order, or any application
   file (`useMotionSubscribers.js`, `helpers.js`, `SpiralBall.jsx`, `TowerDefensePage.jsx`). If any
   of those appear in the diff, back it out.

---

## Things you must NOT do (scope guard)

- Do NOT implement Option C's cross-frame epoch cache (`gsap.ticker.frame`-keyed). This brief is
  strictly per-call scoping — the `ctx` Map is discarded when the root call returns. No field on
  `Track` should persist a composed patch between separate `compose()` calls.
- Do NOT change fold order, `setObserved`, `removeObserved`, or `observedSources`. They are correct
  as-is and out of scope.
- Do NOT touch `addChild`/`removeChild`/`LayoutDelegate` — different axis, already ruled out of
  scope in the prior brief and still is here.
- Do NOT add a `ctx` parameter to any public-facing call site outside `Track.js`. Every external
  caller keeps calling `compose(rawData)` with one argument; `ctx` is compose()'s own internal
  recursion detail.
- Do NOT reorder the `composePatch(...)` call and the `ctx.set(this, COMPOSING)` call — the
  sentinel must be set BEFORE the fold loop runs, or the cycle guard breaks.
