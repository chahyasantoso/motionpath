# Brief 13 — Remove unreachable, inconsistently-error-handled loop in composePatch

**Priority: MEDIUM.** Not a live bug today, but it's dead duplicate logic that breaks the project's own error-handling convention if it ever does execute. Fix is small and safe.
**Branch:** `v3`
**Files touched:** `src/usecases/ComposeTrackPatch.js`

---

## The problem

`composeTrackPatch()` currently has two loops that both call `plugin.compose()` and merge results into `patch`:

1. **Loop 1** (over `plugins`, the already-resolved plugin list for this track): wraps `plugin.compose()` in try/catch and rethrows with full context — `composePatch: plugin compose failed for motion "X", track "Y", property key(s) [...]: <original message>`. This is the project's established error-handling standard (confirmed by the existing test `'throws on plugin compose failure with context...'`).

2. **Loop 2** ("Dynamically resolve and compose any extra properties present in rawData"): re-resolves a plugin via `resolvePluginForKey()` for any `rawData` key not already in `patch`, and calls `plugin.compose()` again — with **no try/catch**. If this ever throws, the caller gets a raw, contextless plugin error instead of the standard wrapped one.

In practice, Loop 2 is unreachable in current usage: `rawData` is the track's proxy object, and every key in that proxy is written by `contribute()` from a plugin already present in `plugins` (the same list Loop 1 iterates). There's no code path today where `rawData` contains a key whose owning plugin isn't already in `plugins`. This is confirmed by grep: nothing in `BuildTrackTween.js` or `MotionInstance.js` writes extra untracked keys onto the proxy outside of what `plugins` already covers.

So Loop 2 is simultaneously: dead code (YAGNI/DRY violation — duplicates Loop 1's logic for a case that can't occur), and a landmine (if it ever *does* become reachable through a future change, it silently violates the "always throw with context" rule).

## Locked decision

Delete Loop 2 entirely. `composeTrackPatch()` should have exactly one compose-and-merge loop, over `plugins`, matching the plugin resolution that already happened upstream (in `BaseEngine`/`MotionInstance`) when the track's plugin list was built.

## Non-goals

- Do NOT change Loop 1's behavior, its try/catch wrapping, or its error message format — it's correct and has passing tests already asserting its exact message shape. Do not touch those tests.
- Do NOT change the `filter` sub-property merge behavior (`patch.filter = { ...(patch.filter || {}), ...v }`) — that's the documented filter-consolidation pattern and must be preserved exactly as-is in the remaining loop.
- Do NOT remove or change `resolvePluginForKey()` itself in `src/domain/plugins.js` — it's used elsewhere (`BuildTrackTween.js`, `BaseEngine.js`) and must be left untouched.
- Do NOT remove the `import { resolvePluginForKey } from '../domain/plugins.js';` line's usage anywhere else — only remove it from `ComposeTrackPatch.js` since after this change it becomes unused in that file.
- Do NOT add new tests asserting Loop 2's old behavior — it never had dedicated test coverage (confirmed: `ComposeTrackPatch.test.js` has exactly 2 tests, neither exercises the `rawData`-extra-key path), so there's nothing to preserve.

## WRONG (current code)

```js
// src/usecases/ComposeTrackPatch.js
import { resolvePluginForKey } from '../domain/plugins.js';

/**
 * ComposeTrackPatch use case.
 * Runs plugin.compose() for every plugin in `plugins`, merges the results into
 * one patch object.
 *
 * @param {Array} plugins - already-resolved plugins for this track
 * @param {object} rawData
 * @param {object} trackConfig
 * @param {string} [context] - human-readable identifier for error messages
 * @returns {object} The composed patch object
 */
export function composeTrackPatch(plugins, rawData, trackConfig, context = '') {
  const patch = {};

  for (const plugin of plugins) {
    if (typeof plugin.compose !== 'function') continue;

    let contribution;
    try {
      contribution = plugin.compose(rawData, trackConfig);
    } catch (e) {
      throw new Error(
        `composePatch: plugin compose failed${context ? ` for ${context}` : ''}, ` +
        `property key(s) [${plugin.keys?.join(', ') ?? '?'}]: ${e.message}`
      );
    }

    if (!contribution) continue;

    for (const [k, v] of Object.entries(contribution)) {
      if (k === 'filter' && typeof v === 'object' && v !== null) {
        patch.filter = { ...(patch.filter || {}), ...v };
      } else {
        patch[k] = v;
      }
    }
  }

  // Dynamically resolve and compose any extra properties present in rawData
  for (const key of Object.keys(rawData || {})) {
    if (patch[key] !== undefined) continue;

    const plugin = resolvePluginForKey(key);
    if (plugin && typeof plugin.compose === 'function') {
      const contribution = plugin.compose(rawData, trackConfig);
      if (contribution && contribution[key] !== undefined) {
        if (key === 'filter' && typeof contribution.filter === 'object' && contribution.filter !== null) {
          patch.filter = { ...(patch.filter || {}), ...contribution.filter };
        } else {
          patch[key] = contribution[key];
        }
      }
    }
  }

  return patch;
}
export { composeTrackPatch as composePatch }; // Export alias for ease of migration
```

## CORRECT (replace the whole file with this)

```js
// src/usecases/ComposeTrackPatch.js
/**
 * ComposeTrackPatch use case.
 * Runs plugin.compose() for every plugin in `plugins`, merges the results into
 * one patch object.
 *
 * Note: `plugins` must already be the fully-resolved plugin list for this
 * track (same list used to build the track's tween/proxy). There is
 * deliberately no secondary "resolve extra properties from rawData" fallback
 * here — every key in `rawData` is written by contribute() from a plugin
 * already in `plugins`, so a second resolution pass would either be dead
 * code or, if it ever did fire, an untracked compose() call that bypasses
 * the error-context wrapping below. One loop, one error-handling path.
 *
 * @param {Array} plugins - already-resolved plugins for this track
 * @param {object} rawData
 * @param {object} trackConfig
 * @param {string} [context] - human-readable identifier for error messages
 * @returns {object} The composed patch object
 */
export function composeTrackPatch(plugins, rawData, trackConfig, context = '') {
  const patch = {};

  for (const plugin of plugins) {
    if (typeof plugin.compose !== 'function') continue;

    let contribution;
    try {
      contribution = plugin.compose(rawData, trackConfig);
    } catch (e) {
      throw new Error(
        `composePatch: plugin compose failed${context ? ` for ${context}` : ''}, ` +
        `property key(s) [${plugin.keys?.join(', ') ?? '?'}]: ${e.message}`
      );
    }

    if (!contribution) continue;

    for (const [k, v] of Object.entries(contribution)) {
      if (k === 'filter' && typeof v === 'object' && v !== null) {
        patch.filter = { ...(patch.filter || {}), ...v };
      } else {
        patch[k] = v;
      }
    }
  }

  return patch;
}
export { composeTrackPatch as composePatch }; // Export alias for ease of migration
```

## Verification checklist

```bash
git clone --branch v3 https://github.com/chahyasantoso/motionpath.git /tmp/verify13
cd /tmp/verify13

# 1. Confirm the dynamic fallback loop and its import are gone
grep -n "resolvePluginForKey" src/usecases/ComposeTrackPatch.js
# expect: NO output (0 matches)

grep -n "Dynamically resolve" src/usecases/ComposeTrackPatch.js
# expect: NO output

# 2. Confirm resolvePluginForKey is untouched everywhere else
grep -rn "resolvePluginForKey" src --include="*.js" | grep -v __tests__
# expect: 3 hits — BuildTrackTween.js, BaseEngine.js, domain/plugins.js (its definition).
# ComposeTrackPatch.js must NOT appear in this list.

# 3. Full suite must still be green — this loop was unreachable, so nothing
#    should break by removing it.
npm install
npx vitest run
# expect: all test files passing, same pass count as before this change
```
