# Brief 12 — Fix track-ID uniqueness scope (project-wide, not per-motion)

**Priority: HIGH.** This is a silent-data-corruption bug in `EditorEngine`, not a style nit.
**Branch:** `v3`
**Files touched:** `src/validators/rules/element-uniqueness.js`, `src/validators/rules/__tests__/element-uniqueness.test.js`

---

## The bug

`element-uniqueness` currently only checks that track IDs are unique **within a single motion**. But `EditorEngine.loadProject()` builds one flat index keyed by track ID **across the entire project**:

```js
// src/engines/EditorEngine.js
for (const trackId of inst.tracksMap.keys()) {
  this.#trackIndex.set(trackId, inst);   // no motionId in the key
}
```

If two different motions declare a track with the same `id` — which the validator currently allows — the second motion mounted silently overwrites the first entry in `#trackIndex`. `subscribe(trackId, ...)`, `compose(trackId, ...)`, and any track-id lookup then resolve to the wrong instance for one of the two motions. No error, no warning — just a track that becomes permanently unreachable in the editor.

This also contradicts the project's own convention: validator rules must throw on real conflicts, never silently allow ambiguity that a consumer can't safely resolve (same principle as the ease-collision and `tweenVars`-collision rules, which throw rather than silently pick a winner).

## Locked decision

Track-ID uniqueness is **project-wide**, not per-motion. This restores the v2 baseline behavior (a single flat uniqueness check across all motions) — it is not a new invention, it's reverting an unintentional v3 regression.

## Non-goals

- Do NOT change `EditorEngine`'s `#trackIndex` data structure (no need to key by `motionId::trackId` — the validator fix removes the need for that).
- Do NOT touch `ProductionEngine` — it doesn't build a flat cross-motion index, so it was never affected by this bug.
- Do NOT change how `element-uniqueness` treats missing/empty `id` fields (still skipped, unchanged).
- Do NOT add uniqueness checks for anything other than `track.id` (motionId uniqueness, templateId uniqueness, etc. are handled by other rules already).

## WRONG (current code)

```js
// src/validators/rules/element-uniqueness.js
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
export function elementUniquenessRule(motions, context) {
  const errors = [];

  if (!Array.isArray(motions)) {
    return errors;
  }

  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== 'object') return;
    const tracks = motion.tracks;
    if (!Array.isArray(tracks)) return;

    const seenIds = new Set();

    tracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== 'object') return;
      const { id } = track;
      if (id !== undefined && id !== null && id !== '') {
        const tid = String(id);
        if (seenIds.has(tid)) {
          errors.push({
            ruleId: "element-uniqueness",
            severity: "error",
            message: `Duplicate track ID '${tid}' found within the same motion (motion index: ${motionIndex}).`,
            path: `motions[${motionIndex}].tracks[${trackIndex}].id`
          });
        } else {
          seenIds.add(tid);
        }
      }
    });
  });

  return errors;
}
```

## CORRECT (replace the whole file with this)

```js
// src/validators/rules/element-uniqueness.js
/**
 * Rule: element-uniqueness
 *
 * Track ID uniqueness check, scoped PROJECT-WIDE across all motions.
 *
 * This must stay project-wide, not per-motion: EditorEngine.loadProject()
 * builds one flat Map keyed only by track id (`#trackIndex`) across every
 * motion in the project, for its subscribe()/compose()/setProgress() API.
 * A per-motion-only check would let two motions declare the same track id,
 * which would then silently collide in that flat map (last motion mounted
 * wins, the other's track becomes unreachable) with no error surfaced
 * anywhere. This rule exists specifically to make that conflict a build-time
 * error instead of a silent runtime bug.
 *
 * Requirements:
 * - Every track.id must be unique across the entire project (all motions).
 * - A duplicate id anywhere in the project -> error, reported at the second
 *   (later) occurrence, with a pointer back to the first occurrence.
 *
 * @param {unknown[]} motions
 * @returns {ValidationError[]}
 */
export function elementUniquenessRule(motions, context) {
  const errors = [];

  if (!Array.isArray(motions)) {
    return errors;
  }

  const seenIds = new Map(); // trackId -> { motionIndex, trackIndex }

  motions.forEach((motion, motionIndex) => {
    if (!motion || typeof motion !== 'object') return;
    const tracks = motion.tracks;
    if (!Array.isArray(tracks)) return;

    tracks.forEach((track, trackIndex) => {
      if (!track || typeof track !== 'object') return;
      const { id } = track;
      if (id !== undefined && id !== null && id !== '') {
        const tid = String(id);
        const first = seenIds.get(tid);
        if (first) {
          errors.push({
            ruleId: "element-uniqueness",
            severity: "error",
            message: `Duplicate track ID '${tid}' found in motions[${motionIndex}].tracks[${trackIndex}] ` +
              `(already used in motions[${first.motionIndex}].tracks[${first.trackIndex}]). ` +
              `Track IDs must be unique project-wide, not just within a motion.`,
            path: `motions[${motionIndex}].tracks[${trackIndex}].id`
          });
        } else {
          seenIds.set(tid, { motionIndex, trackIndex });
        }
      }
    });
  });

  return errors;
}
```

## Test file — replace the whole file

The existing test `'should pass when the same track ID is used across different motions'` asserts the WRONG (permissive) behavior and must be flipped to assert an error.

```js
// src/validators/rules/__tests__/element-uniqueness.test.js
import { describe, it, expect } from 'vitest';
import { elementUniquenessRule } from '../element-uniqueness.js';

describe('element-uniqueness rule', () => {
  it('should pass when track IDs are unique across the whole project', () => {
    const motions = [
      {
        tracks: [{ id: 'el-1' }, { id: 'el-2' }]
      },
      {
        tracks: [{ id: 'el-3' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(0);
  });

  it('should error when a track ID is duplicated within the same motion', () => {
    const motions = [
      {
        tracks: [{ id: 'el-1' }, { id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[0].tracks[1].id');
    expect(errors[0].message).toContain("Duplicate track ID 'el-1'");
  });

  it('should error when the same track ID is used across different motions', () => {
    const motions = [
      {
        tracks: [{ id: 'el-1' }]
      },
      {
        tracks: [{ id: 'el-1' }]
      }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe('element-uniqueness');
    expect(errors[0].severity).toBe('error');
    expect(errors[0].path).toBe('motions[1].tracks[0].id');
    expect(errors[0].message).toContain("Duplicate track ID 'el-1'");
    expect(errors[0].message).toContain('motions[0].tracks[0]');
  });

  it('should report each duplicate independently when the same ID repeats 3+ times', () => {
    const motions = [
      { tracks: [{ id: 'el-1' }] },
      { tracks: [{ id: 'el-1' }] },
      { tracks: [{ id: 'el-1' }] }
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(2);
    expect(errors[0].path).toBe('motions[1].tracks[0].id');
    expect(errors[1].path).toBe('motions[2].tracks[0].id');
  });
});
```

## Verification checklist (run these yourself, do not trust Gemini's self-report)

```bash
# 1. Fresh clone, confirm the file changes landed
git clone --branch v3 https://github.com/chahyasantoso/motionpath.git /tmp/verify12
cd /tmp/verify12
grep -n "project-wide" src/validators/rules/element-uniqueness.js
# expect: multiple hits, including in the docstring

grep -n "seenIds = new Map" src/validators/rules/element-uniqueness.js
# expect: 1 hit (was `new Set()` before)

grep -c "should error when the same track ID is used across different motions" src/validators/rules/__tests__/element-uniqueness.test.js
# expect: 1

grep -c "should pass when the same track ID is used across different motions" src/validators/rules/__tests__/element-uniqueness.test.js
# expect: 0 (old permissive test name must be gone, not just modified in place under the same name)

# 2. Full suite must still be green
npm install
npx vitest run
# expect: all test files passing, including the 4 tests in element-uniqueness.test.js
```

**Do not accept "tests pass" alone as proof.** Also manually confirm by reading the diff that:
- No other file was touched (this is a two-file change: the rule + its test).
- `EditorEngine.js` was NOT modified (this fix belongs entirely in the validator).
