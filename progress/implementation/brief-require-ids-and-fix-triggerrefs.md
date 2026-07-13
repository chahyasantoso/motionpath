# Brief: Require `motionId` and `track.id`, delete positional-fallback lookups, fix `element-uniqueness` scope claim, scope `_triggerRefs`

**Branch:** `v3`, from `a1a34f3`. Supersedes the previous "make MotionProject handle optional motionId" brief — this is the better fix. Instead of patching the Map-collapse bug to correctly support anonymous motions/tracks, we're removing anonymous identity as a concept entirely: every real schema in this repo (`TowerDefensePage`, `BurstPage`, `PasarMalamPage`, `MotorcyclePage`) already names 100% of its motions and tracks, so this is a pure simplification with zero migration cost.

Do the fixes in this order — #3 and #4 depend on #1/#2 being true.

---

## Fix 1 — Require `motionId` in `motion-structure.js`

**Why:** `motionId` was optional, falling back to positional array index. `MotionProject`'s `Map` keyed motions by raw `m.motionId`, so every motion omitting it collapsed onto the single key `undefined` — confirmed via repro, silent data loss. Beyond that specific bug, positional identity is fragile under edit (reordering the array silently reassigns what index `N` refers to) and a poor fit for AI-agent-generated schemas, which is this project's actual use case.

`src/validators/rules/motion-structure.js`, inside the `motions.entries()` loop:

**WRONG (current):**
```js
// Validate motionId
if (motionId !== undefined && motionId !== null) {
  if (typeof motionId !== 'string') {
    errors.push({
      ruleId: 'motion-structure',
      severity: 'error',
      message: 'motionId must be a string.',
      path: `${motionPath}.motionId`
    });
  } else {
    if (seenMotionIds.has(motionId)) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Duplicate motionId '${motionId}' found.`,
        path: `${motionPath}.motionId`
      });
    }
    seenMotionIds.add(motionId);
  }
}
```

**CORRECT:**
```js
// Validate motionId — required, unlike templateId no longer optional-with-fallback
if (typeof motionId !== 'string' || motionId === '') {
  errors.push({
    ruleId: 'motion-structure',
    severity: 'error',
    message: 'motionId is required and must be a non-empty string.',
    path: `${motionPath}.motionId`
  });
} else {
  if (seenMotionIds.has(motionId)) {
    errors.push({
      ruleId: 'motion-structure',
      severity: 'error',
      message: `Duplicate motionId '${motionId}' found.`,
      path: `${motionPath}.motionId`
    });
  }
  seenMotionIds.add(motionId);
}
```

Every downstream error message in this file that currently reads `motionId || i` can stay as-is (harmless once `motionId` is guaranteed present) — not required to change those for this brief, though a follow-up cleanup could drop the `|| i` fallback.

---

## Fix 2 — Require `track.id` in `motion-structure.js`

**Why:** same bug, one level down, and worse in practice: `MotionInstance._build()` does `this.tracksMap.set(track.id, {...})` with **zero fallback** — two tracks in one motion both omitting `id` silently overwrite each other with no rescue path at all. Same pattern also exists unguarded in `src/usecases/BuildProject.js` (`trackPlugins.set(track.id, ...)`, `tracksMap.set(track.id, ...)`) and `src/engines/resolveMotion.js` (`result[track.id] = patch`, plus the tween cache key). All of these become safe once `track.id` is guaranteed present and unique within its motion.

Same file, inside the tracks loop (`for (const [j, track] of tracks.entries())`):

**WRONG (current):**
```js
for (const [j, track] of tracks.entries()) {
  if (track && typeof track === 'object' && track.use !== undefined) {
    if (!seenTemplateIds.has(track.use)) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Track references non-existent templateId '${track.use}'.`,
        path: `${motionPath}.tracks[${j}].use`
      });
    }
  }
}
```

**CORRECT:**
```js
for (const [j, track] of tracks.entries()) {
  if (!track || typeof track !== 'object') continue;

  if (typeof track.id !== 'string' || track.id === '') {
    errors.push({
      ruleId: 'motion-structure',
      severity: 'error',
      message: `Motion "${motionId || i}": track.id is required and must be a non-empty string.`,
      path: `${motionPath}.tracks[${j}].id`
    });
  }

  if (track.use !== undefined) {
    if (!seenTemplateIds.has(track.use)) {
      errors.push({
        ruleId: 'motion-structure',
        severity: 'error',
        message: `Track references non-existent templateId '${track.use}'.`,
        path: `${motionPath}.tracks[${j}].use`
      });
    }
  }
}
```

Track-id *uniqueness within a motion* is already handled by `element-uniqueness.js` (Fix 4 below) — don't duplicate that check here, this only adds the "must be present" requirement.

---

## Fix 3 — Simplify `MotionProject` and delete positional-fallback lookups

Now that `motionId` is guaranteed present and unique project-wide (validator-enforced before anything downstream runs), the Map can be a plain string key with no index-fallback logic anywhere.

`src/domain/models.js`:

**WRONG:**
```js
this.motions = new Map(motions.map(m => [m.motionId, m]));
```

**CORRECT:**
```js
// motionId is validator-guaranteed present and unique by the time a schema
// reaches this constructor — no positional-index fallback needed or wanted.
this.motions = new Map(motions.map(m => [m.motionId, m]));
```
*(No code change needed here — the line is already correct once Fix 1 guarantees its precondition. Leave as-is; this entry documents why no change is needed so it isn't "fixed" again by mistake.)*

Delete the dead fallback-search blocks in all 4 places that reach around `getMotion()`:

Files: `src/engines/ProductionEngine.js` (`mountInstance`, `mountTimeline`), `src/engines/EditorEngine.js` (`mountTimeline`), `src/engines/resolveMotion.js` (`resolve`).

**WRONG (pattern repeated in all 4 places, e.g. `ProductionEngine.mountInstance`):**
```js
let schemaMotion = _project.getMotion(motionId);
if (!schemaMotion) {
  const motionsList = _project.getMotionsList();
  schemaMotion = motionsList.find(
    (m, idx) => m.motionId === motionId || String(idx) === motionId
  );
}
if (!schemaMotion) {
  throw new Error(`mountInstance: motion with id "${motionId}" not found.`);
}
```

**CORRECT:**
```js
const schemaMotion = _project.getMotion(motionId);
if (!schemaMotion) {
  throw new Error(`mountInstance: motion with id "${motionId}" not found.`);
}
```

Apply the equivalent simplification in `mountTimeline` (both engines, same pattern, keep each one's own error message text).

`resolveMotion.js`'s `resolve()` keeps its dual-mode support for being called with either a `MotionProject` or a raw schema object (do not remove that — some callers may still pass a raw schema). Simplify only the domain-object branch:

**WRONG:**
```js
const isDomain = schema && typeof schema.getMotion === 'function';
let originalMotion = isDomain 
  ? schema.getMotion(motionId) 
  : schema.motions?.find(
      m => m && (m.motionId === motionId || (m.motionId === undefined && String(schema.motions.indexOf(m)) === motionId))
    );

if (!originalMotion && isDomain) {
  const motionsList = schema.getMotionsList();
  originalMotion = motionsList.find(
    (m, idx) => m.motionId === motionId || String(idx) === motionId
  );
}
```

**CORRECT:**
```js
const isDomain = schema && typeof schema.getMotion === 'function';
const originalMotion = isDomain
  ? schema.getMotion(motionId)
  : schema.motions?.find(m => m && m.motionId === motionId);
```
(The raw-schema branch also drops its own positional fallback, for the same reason — `motionId` is guaranteed by validation before any of this runs.)

---

## Fix 4 — Correct `element-uniqueness.js`'s scope claim, don't change its behavior

**Finding:** the rule's own docstring says *"Project-wide track ID uniqueness check across ALL motions... Any ID appearing in more than one motion → error."* The implementation resets `seenIds` inside the per-motion loop, so it only ever catches duplicates within a single motion — and the existing test suite locks this in explicitly (`'should pass when the same track ID is used across different motions'`, asserting zero errors).

**Decision:** keep the per-motion scope. Nothing in the current architecture looks up a track by `id` without a `motionId` alongside it (`instance.subscribe(trackId, ...)`, `resolveMotion(motionId, progress, overrides)` with overrides keyed per-track within that one motion) — true project-wide uniqueness isn't needed by anything that exists. Don't build it. Just fix the doc so it stops claiming behavior the rule doesn't have.

`src/validators/rules/element-uniqueness.js`:

**WRONG (docstring):**
```js
/**
 * Rule: element-uniqueness
 * * Project-wide track ID uniqueness check across ALL motions.
 * 
 * * Requirements:
 * - Collect every track ID across the entire project's motions.
 * - Any ID appearing in more than one motion -> error.
 * 
 * @param {unknown[]} motions
 * @returns {ValidationError[]}
 */
```

**CORRECT:**
```js
/**
 * Rule: element-uniqueness
 *
 * Track ID uniqueness check, scoped per motion (not project-wide — nothing
 * in the engine currently looks up a track by id without a motionId
 * alongside it, so cross-motion duplicates are intentionally allowed).
 *
 * Requirements:
 * - Within a single motion, every track.id must be unique.
 * - A duplicate id within the same motion -> error.
 *
 * @param {unknown[]} motions
 * @returns {ValidationError[]}
 */
```

No logic or test changes needed — the existing tests already assert the (correct, per-motion) behavior.

---

## Fix 5 — Scope `_triggerRefs` to the factory instance

Carried over unapplied from two briefs ago. `src/engines/ProductionEngine.js`:

**WRONG (current):**
```js
export function createProductionEngine(deps) {
  // ...
  return {
    // ...
    registerTriggerRef(id, ref) { _triggerRefs.set(id, ref); },
    unregisterTriggerRef(id) { _triggerRefs.delete(id); }
  };
}

const _triggerRefs = new Map(); // module-level, shared by every instance

export const productionEngine = createProductionEngine({
  resolveElement: (id) => {
    const ref = _triggerRefs.get(id);
    if (!ref || !ref.current) {
      throw new Error(/* ... */);
    }
    return ref.current;
  },
});
```

**CORRECT:**
```js
export function createProductionEngine(deps = {}) {
  const _triggerRefs = new Map(); // id -> React.RefObject, scoped to this engine instance

  const resolveElement = deps.resolveElement ?? ((id) => {
    const ref = _triggerRefs.get(id);
    if (!ref || !ref.current) {
      throw new Error(
        `MotionPath: trigger ref '${id}' is not registered. ` +
        `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
        `before this project's scenarios are wired.`
      );
    }
    return ref.current;
  });

  const _deps = { ...deps, resolveElement };
  // ... every other use of `deps` in this file (inside mountInstance's
  // instanceDeps = { ...deps, mountInstance: ... }) switches to `_deps`.

  return {
    // ...
    registerTriggerRef(id, ref) { _triggerRefs.set(id, ref); },
    unregisterTriggerRef(id) { _triggerRefs.delete(id); }
  };
}

export const productionEngine = createProductionEngine();
export default productionEngine;
```

---

## Non-goals
- Not implementing true project-wide track-id uniqueness — explicitly rejected in Fix 4, doc-only change.
- Not touching `sectionId`/`timelineId` requiredness — these are optional grouping fields by design, not identity fields, and stay that way.
- Not forcing `resolveMotion.resolve()` to drop its raw-schema (`isDomain === false`) code path.
- Not renaming or implementing `mountTimeline` beyond the lookup simplification — it stays validate-only.
- Not adding a schema migration/codemod — confirmed zero real content is affected by requiring `motionId`/`track.id`.

## Verification checklist (fresh clone, grep + a real test run)
1. `validateProject()` on a schema with a motion missing `motionId` returns a hard error mentioning `"motionId is required"`. Same for a track missing `id`.
2. New/updated tests in `motion-structure.test.js` covering both new required-field errors.
3. `grep -rn "motionsList.find\|schema.motions.indexOf" src` returns zero hits — confirms every positional-fallback block was deleted, not just the validator added on top of it.
4. `grep -n "Project-wide" src/validators/rules/element-uniqueness.js` returns zero hits — docstring corrected.
5. `grep -n "_triggerRefs" src/engines/ProductionEngine.js` shows it declared only inside the factory function.
6. New isolation test: two `createProductionEngine()` instances, a trigger ref registered on one, the other still throws `"is not registered"` for the same id.
7. Full suite green. Existing `element-uniqueness.test.js` needs no changes (its assertions already match the now-documented-correctly per-motion behavior) — if Gemini finds itself wanting to change those tests, stop and flag it, that's a sign the scope decision in Fix 4 is being second-guessed mid-implementation rather than followed.
