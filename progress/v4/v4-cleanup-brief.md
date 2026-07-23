# MotionPath v4 — Post-Phase-0 Cleanup Brief

**Branch:** `v4`
**Base commit:** `a35efed` ("finish Phase 0 exactly by deleting legacy v3 engine...")
**Author:** Claude (senior review pass), for implementation by Gemini Flash
**Verification method:** fresh `git clone`, `npx vitest run`, targeted `grep` — do not trust
your own summary of what you changed. Re-run the checklist at the bottom before reporting done.

---

## Context

`a35efed` claimed to finish Phase 0 by deleting the legacy v3 engine outright. Most of that
deletion is real (`MotionInstance.js`, `BaseEngine/EditorEngine/ProductionEngine.js`,
`TimelineGroupController.js`, `resolveMotion.js` are genuinely gone — verified). But three
things were missed, and they all point the same direction: **v3's `driver`/`timelineId`/
`primary` shape is still alive in places it shouldn't be**, contradicting the locked v4
decision that this vocabulary is deleted, not deprecated.

Each fix below is independent. Implement and verify one at a time, in that order, and commit
separately — same discipline as always. **Do not combine them into one commit.**

## Locked decisions (restated, still binding)

- `trigger.type` is **always** required on every motion in v4. There is no `driver` wrapper,
  no `timelineId`/`primary` grouping, no `"manual"` special-case absence-of-field. These are
  not "unsupported now" — they are actively forbidden and must produce a validation error
  explaining why, not be silently accepted as an alternate valid shape.
- Nothing in the shipped app should import v3-only code. If a file only exists to serve v3
  shapes, it gets deleted, not kept "in case."

## Non-goals (explicitly out of scope for this brief)

- **Do not** touch `src/lib/Track.js`, `src/lib/Motion.js`, `src/lib/TriggerDelegate.js`,
  `src/lib/createTrack.js`, or `src/hooks/useMotionTimelinePlayback.js`. These were already
  reviewed and fixed directly (see `core-fixes.diff` alongside this brief) — pull that diff
  in first, don't re-derive the same changes independently.
- **Do not** add new schema features, new trigger types, or new validator rules beyond what's
  specified. This is subtraction, not addition.
- **Do not** rewrite `parseV4Project.js` — it's already correct (registry-checked, no legacy
  branch). Leave it alone.

---

## Fix 1 — Remove the v3/v4 dual-mode branch from `motion-structure.js`

**File:** `src/validators/rules/motion-structure.js`

**Why:** The rule currently has an `isV4` flag that decides whether to validate the schema as
v4 (`trigger` required, `driver`/`timelineId`/`primary` forbidden) **or** as legacy v3
(`driver.type: 'timeline'|'delegate'` required, `timelineId`/`primary`/`sectionId` all
accepted as valid). This means a stale v3-shaped project file passes `validateProject()`
cleanly today, even though nothing downstream (`parseV4Project.js`, `Motion`, `Track`,
`TriggerDelegate`) can actually run it — it'll fail later, in a more confusing place, or not
at all if the shape happens to also look enough like something the parser tolerates. The
whole point of validating up front is to catch this here.

### WRONG (current state — dual-mode branch)
```js
if (isV4 || (driver === undefined && trigger !== undefined)) {
  // v4 checks: forbid driver/timelineId/primary/lifecycle/playback, require trigger
  ...
} else {
  // Legacy v3 driver validation
  if (driver === undefined || driver === null) {
    errors.push({ message: 'driver is required on every motion.', ... });
  } else if (typeof driver !== 'object') {
    ...
  } else {
    const { type, trigger: driverTrigger, sectionId, timelineId: dTimelineId, primary: driverPrimary } = driver;
    if (type !== 'timeline' && type !== 'delegate') { ... }
    else if (type === 'delegate') { /* validates sectionId, timelineId, primary as legitimate v3 fields */ }
  }
}
```

### CORRECT
Delete the `isV4` flag and the entire `else` (legacy) branch. Every motion is validated the
same way, unconditionally:

```js
for (const [i, motion] of motions.entries()) {
  const motionPath = `motions[${i}]`;
  if (!motion || typeof motion !== 'object') continue;

  const { id, motionId, driver, trigger, tracks, timelineId, primary, lifecycle, playback } = motion;
  const effectiveId = id ?? motionId;

  if (typeof effectiveId !== 'string' || effectiveId === '') {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: 'motionId is required and must be a non-empty string.',
      path: `${motionPath}.${id !== undefined ? 'id' : 'motionId'}` });
  } else {
    if (seenMotionIds.has(effectiveId)) {
      errors.push({ ruleId: 'motion-structure', severity: 'error',
        message: `Duplicate motionId '${effectiveId}' found.`,
        path: `${motionPath}.${id !== undefined ? 'id' : 'motionId'}` });
    }
    seenMotionIds.add(effectiveId);
  }

  if (driver !== undefined) {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: '"driver" is a v2/v3 field, not valid in v4 — motions always have a trigger, no driver wrapper needed.',
      path: `${motionPath}.driver` });
  }
  if (timelineId !== undefined) {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: '"timelineId" is a v2/v3 field, not valid in v4 — tracks under the same motion share a trigger automatically.',
      path: `${motionPath}.timelineId` });
  }
  if (primary !== undefined) {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: '"primary" is a v2/v3 field, not valid in v4.',
      path: `${motionPath}.primary` });
  }
  if (lifecycle !== undefined) {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: '"lifecycle" is a v2/v3 field, not valid in v4.',
      path: `${motionPath}.lifecycle` });
  }
  if (playback !== undefined) {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: '"playback" is a v2/v3 field, not valid in v4.',
      path: `${motionPath}.playback` });
  }

  if (trigger === undefined || trigger === null) {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: 'trigger is required on every motion in v4.',
      path: `${motionPath}.trigger` });
  } else if (typeof trigger !== 'object') {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: 'trigger must be an object.',
      path: `${motionPath}.trigger` });
  } else if (!trigger.type || typeof trigger.type !== 'string') {
    errors.push({ ruleId: 'motion-structure', severity: 'error',
      message: 'trigger.type is required and must be a string.',
      path: `${motionPath}.trigger.type` });
  }

  validateTracksArray(tracks, `${motionPath}.tracks`, effectiveId || i);
}
```

Note this also drops the top-of-file JSDoc line `Supports both v3 and v4 schema shapes.` —
update it to `Validates the v4 motion shape. v2/v3 fields (driver, timelineId, primary,
lifecycle, playback) are explicitly forbidden with a dedicated error each.`

The template-level forbidden-field checks (`driver`/`timelineId`/`primary`/`trigger` on
`templates[]`) are already unconditional today — leave those exactly as they are.

---

## Fix 2 — Remove the same dual-mode branch from `trigger-shape.js`

**File:** `src/validators/rules/trigger-shape.js`

**Why:** Same issue, different file. This rule currently does:
```js
if (motion.driver?.type === 'delegate') {
  return errors; // skip validation entirely for legacy delegate motions
}
const isV4Trigger = motion.trigger !== undefined;
const trigger = motion.trigger ?? motion.driver?.trigger;
```
This reads `trigger` off `motion.driver.trigger` as a fallback, and skips validation
entirely when `motion.driver?.type === 'delegate'`. Since Fix 1 now makes `driver` itself a
hard error at the `motion-structure` level, this rule doesn't need to know `driver` exists at
all.

### WRONG
```js
export function triggerShapeRule(motion, context, path) {
  const errors = [];

  if (!motion || typeof motion !== 'object') {
    return errors;
  }

  // Skip validation for delegate motions (delegate forbids trigger entirely, handled by driver rule)
  if (motion.driver?.type === 'delegate') {
    return errors;
  }

  const isV4Trigger = motion.trigger !== undefined;
  const trigger = motion.trigger ?? motion.driver?.trigger;
  const triggerPath = isV4Trigger ? `${path}.trigger` : `${path}.driver.trigger`;
```

### CORRECT
```js
export function triggerShapeRule(motion, context, path) {
  const errors = [];

  if (!motion || typeof motion !== 'object') {
    return errors;
  }

  const trigger = motion.trigger;
  const triggerPath = `${path}.trigger`;
```

Everything below that point (the `trigger === undefined` check, the `type` registry check,
the `scrub`/`endTrigger`/`repeat`/`delay` shape checks) is already correct and v4-only — leave
it untouched. Just delete the two lines that read from `motion.driver` and the branch that
skips validation for `driver.type === 'delegate'`.

Also update the file's top JSDoc comment, which currently says
`Supports both v4 (motion.trigger) and v3 (motion.driver.trigger) shapes.` — change to
`v4-only: motion.trigger is the sole trigger source.`

---

## Fix 3 — Delete dead v3 code that Phase 0's cleanup missed

**Why:** These three files are 100% unreferenced by anything that actually runs. Confirmed by
grep — zero importers outside themselves:

- `src/usecases/CreateMotionInstance.js` — imports
  `../domain/instance/MotionInstance.js`, which `a35efed` already deleted. This file is not
  just unused, it's a **landmine**: anything that imports it in the future will get a
  module-resolution error, not a helpful "this concept is gone" message.
- `src/usecases/ParseProjectSchema.js` — unused, built on the same dead driver model.
- `src/domain/models.js` — the entire file (`createMotionDefinition`, `isTimeline`,
  `isScroll`, `isDelegate`, `isManual`, `createDriver`, `createTimelineDriver` with its
  `timelineId`/`primary` fields, `createDelegateDriver`, `createManualDriver`,
  `createScrollTriggerConfig`, `createTimeTriggerConfig`, `createMotionProject`,
  `createMotionTemplate`, `createMotionTrack`, `getMotion`, `getTemplate`, `getMotionsList`,
  `getTrack`) is **only imported by the two files above**. It has zero other importers.

### Step 0 — verify before deleting (do this first, don't skip)
```bash
grep -rn "from '.*domain/models" --include="*.js" --include="*.jsx" src/
grep -rn "CreateMotionInstance\|createMotionInstance" --include="*.js" --include="*.jsx" src/ | grep -v CreateMotionInstance.js
grep -rn "ParseProjectSchema\|parseProjectSchema" --include="*.js" --include="*.jsx" src/ | grep -v ParseProjectSchema.js
```
Expected: the first command returns only `CreateMotionInstance.js` and
`ParseProjectSchema.js`; the other two return nothing. If anything else shows up, **stop and
report back** — something imports these that this brief didn't account for, and deleting
blind would break it.

### CORRECT
```bash
git rm src/usecases/CreateMotionInstance.js
git rm src/usecases/ParseProjectSchema.js
git rm src/domain/models.js
```
(No test files exist for any of the three — confirmed via `find . -iname "*models.test.js" -o
-iname "*ParseProjectSchema.test.js" -o -iname "*CreateMotionInstance.test.js"` returning
nothing. If your local tree has any, delete those too.)

---

## Verification checklist (run all of these before reporting done)

1. Fresh clone, `npm install`, `npx vitest run` — **all tests still pass, count should not
   drop below 207** (deleting dead code shouldn't remove any test file, since none existed
   for the deleted files).
2. `grep -rn "driver" src/validators/` — should return **zero** hits inside
   `motion-structure.js` and `trigger-shape.js` except the four `"... is a v2/v3 field ..."`
   error-message strings added in Fix 1. If you see a live `motion.driver` or `driver.type`
   read anywhere else in those two files, Fix 1 or Fix 2 is incomplete.
3. `grep -rln "domain/models" src/` — should return **nothing**.
4. `find src -iname "*MotionInstance*" -o -iname "*ParseProjectSchema*"` — should return
   nothing under `src/usecases/` or `src/domain/` (test/doc mentions elsewhere are fine, this
   brief doesn't touch docs).
5. Write a quick throwaway script (don't commit it) that calls `validateProject()` with a
   schema shaped like the *old* v3 example below, and confirm it now returns errors instead
   of `[]`:
   ```js
   {
     motions: [{
       motionId: 'test',
       driver: { type: 'timeline', timelineId: 'group-a', primary: true, trigger: { type: 'scroll', scrub: true } },
       tracks: [{ id: 'track-1', keyframes: {} }]
     }]
   }
   ```
   Expected: at least 3 errors (`driver` forbidden, `timelineId` forbidden, `primary`
   forbidden, plus possibly `trigger is required` since the v3 shape nests trigger under
   `driver`, not at the motion level).
6. Full diff review: confirm nothing besides the three deleted files and the two validator
   rewrites changed. If anything else shows up in the diff — even something that looks like
   a helpful adjacent fix — back it out and flag it separately. This brief is scoped to
   exactly these three fixes.
