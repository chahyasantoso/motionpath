# Fix-Note: Unify `compose()` / `resolveMotion` patch-merge logic

**Scope:** `src/lib/engineCore.js`, `src/lib/resolveMotion.js`, new `src/lib/composePatch.js`.
**Not a new feature. Bug-fix + de-duplication only.**

---

## Problem

`engineCore.js`'s `compose()` and `resolveMotion.js`'s inline compose loop both do the
same conceptual thing — call each resolved plugin's `compose()`, merge the
contributions into a patch object — but they were written independently and have
silently drifted:

|                       | `engineCore.js` `compose()`                  | `resolveMotion.js` (inline) |
| --------------------- | -------------------------------------------- | --------------------------- |
| Plugin error handling | **Swallows silently** (`catch { continue }`) | **Throws** with context     |
| `filter` key merge    | **Flat overwrite** (`patch[k] = v`)          | **Spread-merge**            |

Both are real gaps, verified via direct code read + `git blame` (not assumption):

1. **Silent swallow contradicts the project's own established rule** (ease-collision
   throws, tweenVars collision throws, `resolveMotion`'s own compose errors already
   throw as of the last fix pass). Right now a broken plugin fails loudly in the
   game-loop path and silently in the DOM-rendered path — same failure, two different
   behaviors depending on which caller happens to hit it.
2. **Filter overwrite is currently harmless** (`filterGroupPlugin` is the sole owner of
   all four filter keys today, so only one contribution ever lands in `patch.filter`)
   but is a **latent data-loss bug**: if a second plugin ever contributes a partial
   filter value, `engineCore.compose()` would silently drop whichever contribution
   runs first. `git blame` confirms this wasn't a deliberate choice — the two loops
   were written by different passes hours apart on 2026-07-11, and `resolveMotion.js`
   simply picked the safer merge because filter was already known to be an object by
   the time it was written; `engineCore.js`'s line was never revisited to match.

Root cause is the same in both cases: **the compose-and-merge loop is duplicated,
not shared**, so behavior drifts every time one copy is touched and the other isn't.

## Decision

Extract the compose-and-merge loop only (not plugin _resolution_ — see Non-Goals)
into one shared function, `composePatch()`. Both `engineCore.js` and
`resolveMotion.js` call it. Fixes both divergences by construction — there's only
one place left to drift.

---

## CORRECT

**New file — `src/lib/composePatch.js`:**

```js
/**
 * Runs plugin.compose() for every plugin in `plugins`, merges the results into
 * one patch object. Shared by engineCore.compose() (DOM path) and
 * resolveMotion.js (delegate/game-loop path) so merge behavior can't drift
 * between the two again.
 *
 * Throws (does not swallow) if a plugin's compose() throws — a broken plugin
 * must never produce a patch with silently-missing properties.
 *
 * `filter` contributions are merged key-by-key (not overwritten) since more
 * than one plugin owning a filter sub-key is a real possibility going forward.
 *
 * @param {Array} plugins - already-resolved plugins for this track (resolution
 *   itself stays caller-owned — see fix-note non-goals)
 * @param {object} rawData
 * @param {object} trackConfig
 * @param {string} [context] - human-readable identifier for error messages,
 *   e.g. `track "heroCard"` or `motion "enemyMovement", track "lane1"`
 */
export function composePatch(plugins, rawData, trackConfig, context = "") {
  const patch = {};

  for (const plugin of plugins) {
    if (typeof plugin.compose !== "function") continue;

    let contribution;
    try {
      contribution = plugin.compose(rawData, trackConfig);
    } catch (e) {
      throw new Error(
        `composePatch: plugin compose failed${context ? ` for ${context}` : ""}, ` +
          `property key(s) [${plugin.keys?.join(", ") ?? "?"}]: ${e.message}`,
      );
    }

    if (!contribution) continue;

    for (const [k, v] of Object.entries(contribution)) {
      if (k === "filter" && typeof v === "object" && v !== null) {
        patch.filter = { ...(patch.filter || {}), ...v };
      } else {
        patch[k] = v;
      }
    }
  }

  return patch;
}
```

**`engineCore.js` `compose()` — after plugin resolution (unchanged), replace the loop:**

```js
// plugins resolved above (track's own + claimsKey fallback scan — unchanged)
return composePatch(
  plugins,
  source,
  trackBuild.trackConfig ?? trackBuild,
  `track "${trackId}"`,
);
```

**`resolveMotion.js` `resolve()` — replace the inline loop:**

```js
result[track.id] = composePatch(
  cached.resolvedPlugins,
  cached.proxy,
  cached.resolvedTrack,
  `motion "${motionId}", track "${track.id}"`,
);
```

⚠️ Check the exact existing assertion before changing the message format:
`resolveMotion.test.js` asserts `/plugin compose failed.*delegateMotion.*tr2.*boom/s`
— the new message must still satisfy this regex. `composePatch`'s message shape
(`plugin compose failed for motion "X", track "Y", property key(s) [Z]: <msg>`)
does satisfy it as written above; re-run this exact test after the change,
don't just trust the regex by inspection.

## WRONG

```js
// WRONG — calling composePatch once per plugin instead of once per track with
// the full plugin list. Defeats the point of one shared merge pass and
// reintroduces the "filter overwrite across separate calls" bug this fix
// exists to remove.
for (const plugin of cached.resolvedPlugins) {
  result[track.id] = composePatch([plugin], cached.proxy, cached.resolvedTrack);
}
```

```js
// WRONG — swallowing again "just to be safe" at the call site defeats the
// entire point of the fix. Do not add a new catch here or anywhere else
// composePatch is called.
try {
  return composePatch(
    plugins,
    source,
    trackBuild.trackConfig ?? trackBuild,
    `track "${trackId}"`,
  );
} catch {
  return {};
}
```

---

## Non-Goals

- **Do not touch plugin _resolution_ logic.** `engineCore.compose()`'s `claimsKey`
  fallback scan (picks up plugins for keys not in the track's build-time resolved
  set — needed for `useMotionSubscriber`'s `transformFn` escape hatch) stays
  exactly as-is. `resolveMotion.js` correctly has no such fallback (delegate
  motions have a closed, build-time-known key set) — also stays as-is. This
  fix-note only unifies what happens _after_ the plugin list is already decided.
- **Do not change `resolveMotion`'s caching behavior.** Cache-on-no-override,
  build-and-kill-on-override — untouched.
- **Do not add filter-merge logic anywhere else.** Only `composePatch` owns the
  `filter` special-case.
- **Do not add a new plugin contract method.** `plugin.compose(rawData, trackConfig)`
  signature is unchanged.

---

## Verification Checklist (grep-able, run after implementation)

1. `grep -rn "Defensively ignore\|Defensive: one broken plugin" src/lib/engineCore.js`
   → **zero hits** (the old silent-catch comment/logic must be gone)
2. `grep -rn "for (const \[k, v\] of Object.entries" src/lib/engineCore.js src/lib/resolveMotion.js`
   → **zero hits in both** (merge loop now lives only in `composePatch.js`)
3. `grep -c "composePatch" src/lib/engineCore.js src/lib/resolveMotion.js`
   → **≥1 in each** (both actually import and call it)
4. Full test suite passes, **225 baseline + any new tests added**, including the
   existing `resolveMotion.test.js` throw-message regex test unchanged/still passing
5. New test (add to `composePatch.test.js` or inline in one of the two existing
   suites): two stub plugins both contributing partial `filter` objects
   (`{filter: {blur: 4}}` and `{filter: {brightness: 1.1}}`) → assert the final
   patch has **both** keys present (`{filter: {blur: 4, brightness: 1.1}}`),
   proving the merge-not-overwrite behavior via a wrong-shaped-input test, not
   just an arity check
6. New test: a plugin whose `compose()` throws, called via `engineCore.compose()`
   (DOM path) → assert it now **throws**, not returns `{}` — this is the behavior
   flip; needs its own explicit assertion since the old behavior (swallow) had no
   failing test to catch its removal
