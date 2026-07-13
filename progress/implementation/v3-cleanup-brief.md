# MotionPath v3 — Engine Consistency Cleanup Brief

**Branch:** `v3`
**Base commit:** `1a12fe5` (post `MotionInstance` class refactor)
**Author:** Claude (senior review pass), for implementation by Gemini Flash
**Verification method:** fresh `git clone`, `npx vitest run`, targeted `grep` — do not trust
summaries of your own changes, re-verify against the checklist at the bottom before
reporting done.

---

## Context

The `MotionInstance` class refactor (`1a12fe5`) fixed the main architectural problems from
the prior review. Three smaller, independent issues were found during that same review and
were **not yet fixed** — this brief covers exactly those three, and nothing else.

Each fix is independent. Implement and verify them one at a time, in order. Do not combine
them into a single commit — if something breaks, we need to know which fix caused it.

## Locked decisions

1. `EditorEngine.mountTimeline()` is dead code (zero callers, does nothing but validate)
   and is being **deleted**, mirroring the identical deletion already done in
   `ProductionEngine.js`. It is not being "finished" — see Non-Goals.
2. `ProductionEngine`'s reliance on `this` inside `mountInstance` is being replaced with a
   local reference, to remove the fragility, not to change any behavior.
3. `editorEngineCore.compose()` is being simplified to use the plugin list already cached
   at build time (`buildResult.trackPlugins`), matching the pattern `MotionInstance.compose()`
   already uses successfully. The manual re-scan of `ALL_PLUGINS` on every `compose()` call is
   redundant — `buildTrackTween()` already resolves and throws on any keyframe property with no
   matching plugin, so `trackPlugins.get(trackId)` already contains every plugin `compose()`
   could possibly need. This is a correctness-neutral simplification, not a behavior change.

## Non-goals (explicitly out of scope for this brief)

- **Do not** merge `EditorEngine` onto the `MotionInstance` model, and do not delete
  `editorEngineCore.js`. That unification is real and was discussed, but it's a much larger,
  higher-risk change that touches `setProgress`, `destroySection`, and the whole
  `buildResult`/`tracks` data shape. It gets its own brief later, scoped and verified
  separately.
- **Do not** touch `MotionInstance.js` in this brief. It was already fixed and verified.
- **Do not** add new features, new validators, or new tests beyond what's specified per fix
  below.

---

## Fix 1 — Delete the dead `mountTimeline` stub in `EditorEngine.js`

**File:** `src/engines/EditorEngine.js`

**Why:** This method validates (throws on missing project/motion/delegate) and then does
nothing — no actual mount happens, nothing is returned. It has zero callers anywhere in
`src/hooks` or `src/components`. The identical stub was already deleted from
`ProductionEngine.js` in the last pass; this one was missed.

### WRONG (current state — remove this entire method)
```js
mountTimeline(motionId) {
  if (!_project) {
    throw new Error('mountTimeline: project not loaded.');
  }
  const originalMotion = getMotion(_project, motionId);
  if (!originalMotion) {
    throw new Error(`mountTimeline: motion with id "${motionId}" not found.`);
  }
  const driverType = originalMotion.driver.type;
  if (driverType === 'delegate') {
    throw new Error(`mountTimeline: cannot mount delegate motion "${motionId}".`);
  }
},
```

### CORRECT
Delete the method entirely. After deletion, check whether `getMotion` is still used
elsewhere in `EditorEngine.js` (it is not, as of this brief being written) — if it is now
unused, remove the import too:

```js
// Only remove this import if grep confirms getMotion has no other call site left in this file
import { getMotion } from '../domain/models.js';
```

### Cleanup while you're in this area
`src/engines/__tests__/resolveMotion.test.js` has a stale `describe()` label left over from
when `mountTimeline` tests lived there:

```js
// WRONG (stale name — the mountTimeline tests it refers to are already gone)
describe('resolveMotion and mountTimeline API tests', () => {

// CORRECT
describe('resolveMotion API tests', () => {
```

---

## Fix 2 — Stop relying on `this` in `ProductionEngine.mountInstance`

**File:** `src/engines/ProductionEngine.js`

**Why:** The factory returns a plain object literal. `mountInstance` calls
`this.mountInstance(...)` recursively for child instances. This only works because every
current call site happens to invoke it as `engine.mountInstance(...)`. If it's ever
destructured (`const { mountInstance } = engine`) or passed as a bare callback, `this` becomes
`undefined` and it throws. Fix: give the returned object a name and close over that instead of
relying on call-site binding.

### WRONG (current)
```js
export function createProductionEngine(deps = {}) {
  // ...existing setup unchanged...

  return {
    async loadProject(schema, options = {}) { /* unchanged */ },

    mountInstance(motionId, config = {}) {
      if (!_project || !_core) {
        throw new Error('mountInstance: project not loaded.');
      }

      const onSubscriberChange = (inst, hasSubscribers) => {
        if (!_core) return;
        if (hasSubscribers) {
          _core.registerActiveInstance(inst);
        } else {
          _core.unregisterActiveInstance(inst);
        }
      };

      const instance = createMotionInstance(motionId, config, {
        project: _project,
        resolveElement: _deps.resolveElement,
        mountInstance: (childMotionId, childConfig) => {
          return this.mountInstance(childMotionId, childConfig);
        },
        onSubscriberChange
      });

      _instances.set(instance.id, instance);
      // ...unchanged...
      return instance;
    },

    destroy() { /* unchanged */ },
    resolveMotion(motionId, progress, overrides = {}) { /* unchanged */ },
    registerTriggerRef(id, ref) { /* unchanged */ },
    unregisterTriggerRef(id, ref) { /* unchanged */ }
  };
}
```

### CORRECT
```js
export function createProductionEngine(deps = {}) {
  // ...existing setup unchanged...

  const engine = {
    async loadProject(schema, options = {}) { /* unchanged */ },

    mountInstance(motionId, config = {}) {
      if (!_project || !_core) {
        throw new Error('mountInstance: project not loaded.');
      }

      const onSubscriberChange = (inst, hasSubscribers) => {
        if (!_core) return;
        if (hasSubscribers) {
          _core.registerActiveInstance(inst);
        } else {
          _core.unregisterActiveInstance(inst);
        }
      };

      const instance = createMotionInstance(motionId, config, {
        project: _project,
        resolveElement: _deps.resolveElement,
        mountInstance: (childMotionId, childConfig) => {
          return engine.mountInstance(childMotionId, childConfig);
        },
        onSubscriberChange
      });

      _instances.set(instance.id, instance);
      // ...unchanged...
      return instance;
    },

    destroy() { /* unchanged */ },
    resolveMotion(motionId, progress, overrides = {}) { /* unchanged */ },
    registerTriggerRef(id, ref) { /* unchanged */ },
    unregisterTriggerRef(id, ref) { /* unchanged */ }
  };

  return engine;
}
```

Only the shape changes (`return { ... }` → `const engine = { ... }; return engine;`, and
`this.mountInstance` → `engine.mountInstance`). No method's internal logic changes. Do not
rename any method, do not change any signature.

---

## Fix 3 — Use cached `resolvedPlugins` in `editorEngineCore.compose()`

**File:** `src/engines/editorEngineCore.js`

**Why:** `buildProject()` (in `BuildProject.js`) already resolves and caches the plugin list
per track in `buildResult.trackPlugins` at build time — `buildTrackTween()` resolves a plugin
for every keyframe property and **throws** if any property has no matching plugin, so
`trackPlugins.get(trackId)` is already guaranteed to contain every plugin `compose()` could
need. The current code re-derives an equivalent list from scratch on every single `compose()`
call by scanning all of `ALL_PLUGINS` and matching keys — redundant work, and a second place
where plugin-resolution logic can silently drift from `MotionInstance.compose()`, which already
does this correctly and simply.

### WRONG (current)
```js
compose(trackId, rawData) {
  const trackBuild = buildResult.tracks.get(trackId);
  if (!trackBuild) return {};
  const source = rawData ?? { ...trackBuild.proxy };
  const resolved = buildResult.trackPlugins.get(trackId) ?? [];

  const resolvedKeys = new Set();
  for (const p of resolved) {
    if (p.keys) {
      for (const k of p.keys) {
        resolvedKeys.add(k);
      }
    }
  }

  const plugins = [...resolved];
  for (const p of ALL_PLUGINS) {
    if (resolved.includes(p)) continue;
    if (p.keys && p.keys.some(k => resolvedKeys.has(k))) continue;

    const hasMatchingKey = Object.keys(source).some(key => p.claimsKey(key));

    if (hasMatchingKey) {
      plugins.push(p);
    }
  }

  return composePatch(plugins, source, trackBuild.trackConfig ?? trackBuild, `track "${trackId}"`);
},
```

### CORRECT
```js
compose(trackId, rawData) {
  const trackBuild = buildResult.tracks.get(trackId);
  if (!trackBuild) return {};
  const source = rawData ?? { ...trackBuild.proxy };
  const plugins = buildResult.trackPlugins.get(trackId) ?? [];

  return composePatch(plugins, source, trackBuild.trackConfig ?? trackBuild, `track "${trackId}"`);
},
```

After this change, check whether `ALL_PLUGINS` is still used anywhere else in
`editorEngineCore.js`. If the only usage was inside this method, remove the now-dead import:

```js
// Only remove if grep confirms zero remaining usages in this file
import { ALL_PLUGINS } from '../domain/plugins.js';
```

### Required new test
There is currently no test that directly exercises `editorEngineCore.compose()` with a
multi-property filter track (e.g. `blur` + `brightness` together, which must compose into one
merged `filter` object per the existing `filterGroupPlugin` contract). Add one, either as a new
file `src/engines/__tests__/editorEngineCore.test.js` or appended to
`src/usecases/__tests__/CompileProject.test.js` (whichever existing test setup is closer to
this — check both files first and reuse existing fixture/schema helpers, don't duplicate a
whole new mock schema if one already exists that has a filter-property track):

```js
it('compose() merges blur + brightness into one filter patch using cached trackPlugins', async () => {
  // 1. build a project (via compileProject or buildProject directly) with a motion/track
  //    whose keyframes include both `blur` and `brightness`
  // 2. call core.compose(trackId) with no rawData override
  // 3. assert the returned patch has a single `filter` key containing both
  //    e.g. expect(patch.filter).toEqual(expect.objectContaining({ blur: expect.any(Number), brightness: expect.any(Number) }))
});
```

This test is the safety net for this fix specifically — it must fail if you introduce a
regression where a plugin needed for `compose()` isn't present in the cached `trackPlugins`
list, which is the risk this simplification is trading away the defensive rescan for.

---

## Verification checklist

Run after all three fixes, on a fresh clone — do not verify against your own working
directory.

```bash
git clone --branch v3 --single-branch <repo-url> /tmp/verify && cd /tmp/verify
npm install
npx vitest run
```

Expect: **all tests pass, test count is >= 244** (243 baseline + at least 1 new compose test
from Fix 3).

Then grep-confirm each fix landed exactly as specified — do not accept a passing test suite
alone as proof, per the project's standing verify-first rule:

```bash
# Fix 1 — mountTimeline fully gone from EditorEngine.js
grep -n "mountTimeline" src/engines/EditorEngine.js
# Expect: no output

grep -n "mountTimeline" src/engines/__tests__/resolveMotion.test.js
# Expect: no output (describe label renamed, no leftover references)

# Fix 2 — no remaining `this.` inside ProductionEngine.js's returned object
grep -n "this\." src/engines/ProductionEngine.js
# Expect: no output

grep -n "const engine = {" src/engines/ProductionEngine.js
# Expect: one match

# Fix 3 — ALL_PLUGINS rescan loop removed from editorEngineCore.js
grep -n "ALL_PLUGINS" src/engines/editorEngineCore.js
# Expect: no output (import removed) — if this DOES print, it means the import
# is still referenced somewhere else in the file; open the file and confirm
# by eye that it's not the old rescan loop still present under a different name.

grep -n "resolvedKeys" src/engines/editorEngineCore.js
# Expect: no output — this variable only existed in the old rescan implementation.
```

If any grep check contradicts what you believe you changed, **the fix is not done** —
re-open the file and check, do not report completion based on the test suite alone.
