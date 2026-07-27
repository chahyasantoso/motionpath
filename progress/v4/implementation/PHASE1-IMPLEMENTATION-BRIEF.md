# MotionPath v4 — Phase 1 Implementation Brief

**"Stop the bleeding" — R-01, R-02, R-03, R-04, R-05, R-21, R-26**

Target: branch `v4`. Implementer: Gemini Flash. Verifier: Claude, fresh clone + grep + `npx vitest run`.

Read this whole brief before touching any file. Land changes **in the order given** —
later items assume earlier ones are done. Do not reorder, do not batch into one commit
per file; one commit per R-number, so a bad step is revertible without losing the rest.

---

## Step 0 — Verification gate (run BEFORE writing any code)

Confirm the starting state matches what this brief assumes. If any of these
don't match, STOP and report back — do not improvise a fix for a discrepancy.

```bash
# R-01: validateProject must currently be unreferenced outside validators/
grep -rn "validateProject" src --include=*.js | grep -v __tests__ | grep -v "src/validators/"
# EXPECT: no output

# R-02: motion-structure must currently accept motionId as fallback
grep -n "effectiveId = id ?? motionId" src/validators/rules/motion-structure.js
# EXPECT: 1 match

# R-03: TimeTriggerDelegate.build() must currently ignore duration/delay/autoplay
sed -n '97,105p' src/lib/TriggerDelegate.js
# EXPECT: only repeat/yoyo/repeatDelay referenced

# R-04: Engine must currently have no unmount method
grep -n "unmount(" src/engines/Engine.js
# EXPECT: no output

# R-05: confirm the circular import
grep -n "^import" src/lib/Track.js src/lib/helpers.js
# EXPECT: Track.js imports eventBus from ./helpers.js; helpers.js imports mergePatches from ./Track.js

# stale schemaVersion count (informational, feeds R-01's paired fix)
grep -rln "schemaVersion: 2" src/components
# EXPECT: 6 files (all except PasarMalamPage.jsx)
```

If all six checks match, proceed. If GSAP timing is involved in any fix (it isn't,
in this phase — Phase 1 is integration wiring, not engine internals), a live repro
script would be required per standing methodology; not needed here.

---

## R-26 — Integration tests (land FIRST, before any fix below)

**Why first:** these are the regression net for every fix in this phase. Writing
them after the fixes means they can't prove the fixes actually work, only that
they don't conflict with themselves.

Create `src/__tests__/integration.test.js`. Four tests, real `Engine`, real
`gsap` (no mocks), jsdom environment (already configured — check `vite.config.js`
for `test.environment`).

```js
import { describe, it, expect, beforeEach } from "vitest";
import { gsap } from "gsap";
import { Engine } from "../engines/Engine.js";

describe("integration: Engine -> Motion -> Track -> compose", () => {
  let engine;
  beforeEach(() => {
    engine = new Engine();
  });

  it("loads a project, mounts a time motion, and advances real GSAP time", async () => {
    await engine.loadProject({
      schemaVersion: 4,
      motions: [
        {
          id: "test-motion",
          trigger: { type: "time", repeat: 0 },
          tracks: [
            {
              id: "track-a",
              duration: 1,
              keyframes: {
                opacity: {
                  stops: [
                    { p: 0, v: 0 },
                    { p: 1, v: 1 },
                  ],
                },
              },
            },
          ],
        },
      ],
    });
    const motion = engine.mountInstance("test-motion");
    const track = motion.getTrack("track-a");
    expect(track).toBeTruthy();

    // advance real GSAP ticker-driven time, not a mocked clock
    await new Promise((r) => setTimeout(r, 550));
    const patch = track.compose(track.getSnapshot());
    expect(patch.opacity).toBeGreaterThan(0);
    expect(patch.opacity).toBeLessThan(1);
  });

  it("rejects a schema using motionId instead of id (R-02 regression)", async () => {
    await expect(
      engine.loadProject({
        schemaVersion: 4,
        motions: [
          {
            motionId: "bad",
            trigger: { type: "time" },
            tracks: [{ id: "t", keyframes: {} }],
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it("honors autoplay:false on a time trigger (R-03 regression)", async () => {
    await engine.loadProject({
      schemaVersion: 4,
      motions: [
        {
          id: "paused-motion",
          trigger: { type: "time", autoplay: false },
          tracks: [
            {
              id: "t",
              duration: 1,
              keyframes: {
                opacity: {
                  stops: [
                    { p: 0, v: 0 },
                    { p: 1, v: 1 },
                  ],
                },
              },
            },
          ],
        },
      ],
    });
    const motion = engine.mountInstance("paused-motion");
    await new Promise((r) => setTimeout(r, 200));
    const track = motion.getTrack("t");
    const patch = track.compose(track.getSnapshot());
    expect(patch.opacity).toBe(0); // did not advance — was paused
  });

  it("unmount removes the instance so destroy() does not double-destroy (R-04 regression)", async () => {
    await engine.loadProject({
      schemaVersion: 4,
      motions: [
        {
          id: "m",
          trigger: { type: "manual" },
          tracks: [{ id: "t", keyframes: {} }],
        },
      ],
    });
    const motion = engine.mountInstance("m");
    motion.destroy();
    engine.unmount(motion);
    expect(() => engine.destroy()).not.toThrow();
  });
});
```

**Non-goal:** do not add jsdom DOM-assertion tests here (checking actual rendered
styles via `domRenderer`) — that's out of scope for Phase 1, R-26's ask is proving
the `Engine → Motion → Track → compose` chain, not the DOM write. Don't scope-creep
into `domRenderer` testing.

These 4 tests are expected to **fail** until R-01/R-02/R-03/R-04 below are done.
That's correct — they're written against the target state, not the current one.

---

## R-01 — Wire the validator into `loadProject`

**File:** `src/engines/Engine.js`

```js
// WRONG (current):
async loadProject(schema) {
  this.destroy();
  this.#v4Project = await parseV4Project(schema);
}
```

```js
// CORRECT:
import { validateProject } from '../validators/index.js';

async loadProject(schema, { validate = true } = {}) {
  this.destroy();
  if (validate) {
    const errors = validateProject(schema);
    const hardErrors = errors.filter(e => e.severity === 'error');
    if (hardErrors.length > 0) {
      throw new Error(
        `MotionPath schema validation failed:\n` +
        hardErrors.map(e => `  [${e.ruleId}] ${e.path}: ${e.message}`).join('\n')
      );
    }
  }
  this.#v4Project = await parseV4Project(schema);
}
```

**Non-goals:**

- Do not change `validateProject`'s own rule logic in this step — that's R-02's job,
  separately.
- Do not remove the `{ validate: false }` escape hatch — it exists for hot-path
  callers (game-loop stamping via `createTrack` directly never goes through
  `loadProject` anyway, so this is mostly future-proofing, but keep it).
- Do not touch per-track validation coverage (the doc's "only motion-structure sees
  standalone tracks" gap) — that's a separate, unscoped finding, not part of Phase 1.

### Paired fix — stale `schemaVersion: 2` in every real demo (do in the SAME commit)

Six files currently ship `schemaVersion: 2` while being fully v4-shaped. Once R-01
is wired, this is currently harmless only because `SUPPORTED_SCHEMA_VERSIONS = [2, 3, 4]`
still accepts it. **Do not touch `SUPPORTED_SCHEMA_VERSIONS` in this phase** — that's
R-22, explicitly deferred to Phase 5. Just fix the data:

```bash
grep -rln "schemaVersion: 2" src/components
```

For each match, change `schemaVersion: 2` → `schemaVersion: 4`. Confirmed list as of
Step 0: `TowerDefensePage.jsx`, `BurstPage.jsx`, `DemoPage.jsx`, `MotorcyclePage.jsx`,
`spiralMotions.js`, `PasarMalamObserverPage.jsx`. Do not touch `PasarMalamPage.jsx`
(already correct).

**Non-goal:** do not go looking for other v3-shaped fields in these files while you're
in there. If `motion-structure`'s forbidden-field checks throw on something else, stop
and report it — don't silently patch around it, since an unexpected throw here is new
information the architect needs to see, not something to make disappear.

---

## R-02 — Kill `motionId` as an accepted fallback

**File:** `src/validators/rules/motion-structure.js`

```js
// WRONG (current):
const {
  id,
  motionId,
  driver,
  trigger,
  stagger,
  tracks,
  timelineId,
  primary,
  lifecycle,
  playback,
} = motion;
const effectiveId = id ?? motionId;

if (typeof effectiveId !== "string" || effectiveId === "") {
  errors.push({
    ruleId: "motion-structure",
    severity: "error",
    message: "motionId is required and must be a non-empty string.",
    path: `${motionPath}.${id !== undefined ? "id" : "motionId"}`,
  });
}
```

```js
// CORRECT:
const {
  id,
  motionId,
  driver,
  trigger,
  stagger,
  tracks,
  timelineId,
  primary,
  lifecycle,
  playback,
} = motion;

if (motionId !== undefined) {
  errors.push({
    ruleId: "motion-structure",
    severity: "error",
    message: '"motionId" is a v2/v3 field, not valid in v4 — use "id".',
    path: `${motionPath}.motionId`,
  });
}

if (typeof id !== "string" || id === "") {
  errors.push({
    ruleId: "motion-structure",
    severity: "error",
    message: "id is required and must be a non-empty string.",
    path: `${motionPath}.id`,
  });
}
```

Also update every other reference to `effectiveId` in the same file (duplicate-id
check, `validateTracksArray` call) to use `id` directly instead — `effectiveId` as a
variable name should not survive this change, since keeping it invites the same bug
to come back if someone reintroduces a fallback later.

**Non-goal:** do not add a migration/auto-rename path from `motionId` → `id`. Per your
own locked decision, v3 concepts are deleted, not adapted — a schema using `motionId`
should fail loudly, not get silently coerced.

---

## R-03 — Honor `autoplay`/`delay` on time triggers; reject `duration`

**File:** `src/lib/TriggerDelegate.js`, `TimeTriggerDelegate`

```js
// WRONG (current):
build() {
  this.#timeline = gsap.timeline({
    repeat: this.#config.repeat ?? 0,
    yoyo: !!this.#config.yoyo,
    repeatDelay: this.#config.repeatDelay ?? 0,
  });
  this.#controls = new AutonomousTimelineControls(this.#timeline);
  return this.#timeline;
}
```

```js
// CORRECT:
build() {
  this.#timeline = gsap.timeline({
    repeat: this.#config.repeat ?? 0,
    yoyo: !!this.#config.yoyo,
    repeatDelay: this.#config.repeatDelay ?? 0,
    delay: this.#config.delay ?? 0,
    paused: this.#config.autoplay === false,
  });
  this.#controls = new AutonomousTimelineControls(this.#timeline);
  return this.#timeline;
}
```

**`duration` decision (locked for this brief — do not improvise an alternative):**
`duration` on a `time` trigger has no defined runtime meaning (track-level `duration`
already governs each track's own tween). Rather than invent `timeScale` semantics
that no current schema actually needs, **reject it at validation time** instead of
honoring it silently.

**File:** `src/validators/rules/trigger-shape.js`

```js
// ADD, inside the `if (type === 'time')` region — this rule currently has no
// type === 'time' branch at all; add one:
if (type === "time" && trigger.duration !== undefined) {
  errors.push({
    ruleId: "trigger-shape",
    severity: "error",
    message:
      "trigger.duration has no effect on time triggers — set duration on individual tracks instead.",
    path: `${triggerPath}.duration`,
  });
}
```

### Paired data fix (same commit): remove dead `duration` from spiral schema

`components/Spiral/spiralMotions.js` has two `time` triggers authoring `duration`
(`createSpiralBallScene`, `createSpiralTransitionScene`). **Verified via grep that
neither `spiral-zuma` nor `ball-exit` motion is ever mounted via `engine.mountInstance`**
— `useSpiralWaveController.js` only calls `engine.getTrackConfig(...)` and stamps
tracks directly, bypassing these Motions entirely. So this is inert data, safe to
edit with zero behavior change:

```js
// WRONG (current):
trigger: { type: 'time', duration: ballTravelSeconds },
...
trigger: { type: 'time', autoplay: false, duration: 0.35 },
```

```js
// CORRECT — drop duration, keep everything else:
trigger: { type: 'time' },
...
trigger: { type: 'time', autoplay: false },
```

**Non-goal:** do not touch `useSpiralWaveController.js` in this step. Its hand-rolled
`gsap.to(exitTrack, {...})` driving is a separate, larger refactor (tracked as the
R-13 orchestration-layer work) — out of scope here. This step only stops the schema
from authoring a field the validator will now reject.

---

## R-04 — Prune `Engine.#instances`; unify key space; adopt stamped tracks

**File:** `src/engines/Engine.js`

```js
// ADD this method:
unmount(instanceOrTrackId) {
  const id = typeof instanceOrTrackId === 'string' ? instanceOrTrackId : instanceOrTrackId?.id;
  if (!id) return;
  this.#instances.delete(id);
}

// ADD this method — for tracks stamped via createTrack() outside mountInstance,
// e.g. Spiral's per-ball stamping. Registers for cleanup WITHOUT wrapping in a Motion.
adopt(track) {
  this.#instances.set(track.id, track);
  return track;
}
```

Key space is already unified — `mountInstance` uses `motion.id` (the synthetic
`motion-N`) for Motions and `track.id` for standalone tracks, both landing in the
same `#instances` Map, both string keys. **Confirm this via Step 0's re-check before
assuming it needs a separate fix** — the review's phrasing ("mixed key space") reads
as a bigger problem than the current code actually has; `adopt()` + `unmount()` closes
the real gap (stamped tracks unreachable, destroyed instances never pruned).

**Non-goal:** do not change what `destroy()` does to already-correctly-destroyed
instances — the fix is that callers now _tell_ the Engine when they're done (via
`unmount`), not that `destroy()` grows defensive double-destroy guards. Calling
`unmount()` is the caller's responsibility going forward; don't paper over a missed
`unmount()` call with silent idempotency in `destroy()` itself.

**Hook call sites to update** (add `engine.unmount(instance)` alongside every existing
`instance.destroy()` in cleanup/unmount code):

```bash
grep -rln "\.destroy()" src/hooks src/components --include=*.js --include=*.jsx | grep -v __tests__
```

Check each result. Where the destroyed thing came from `engine.mountInstance(...)` or
`engine.mountWithDelegate(...)`, add `engine.unmount(...)` right after `.destroy()`.
Where it came from `createTrack(...)` directly (bypassing the Engine, e.g. Spiral's
stamped ball/exit/entrance tracks), that's a separate, optional follow-up — wiring
`adopt()` into Spiral's stamping calls is not required for Phase 1 to be complete,
since those tracks are already correctly destroyed by the controller itself. Flag
which call sites you left unwired and why, in the PR description.

---

## R-05 — Break the `Track.js` ↔ `helpers.js` import cycle

**Move, don't rewrite the function bodies:**

1. `mergePatches` (currently in `Track.js`) → move into
   `src/usecases/ComposeTrackPatch.js`. Update its one export and the one import
   site in `Track.js` (`import { mergePatches } from '../usecases/ComposeTrackPatch.js'`
   — note the relative path change, `lib/` → `usecases/` is a sibling-of-`src`, not
   nested).
2. `eventBus` + the `EventBus` class (currently in `helpers.js`) → move into a new
   file `src/lib/eventBus.js`. `Track.js` imports it from there instead.
3. `switchToTrack` (currently in `helpers.js`) → move into `src/hooks/` as its own
   file, `src/hooks/switchToTrack.js`, since it's DOM-aware (`domRenderer`) and
   doesn't belong in `lib/` per the layering the review names.
4. `playOnEvent` and `autoPlay` and `applyAnchor` **stay in `helpers.js`** — they
   don't participate in the cycle and don't need to move. Don't move things that
   aren't broken.

After the move, re-run Step 0's R-05 grep — it should now show `helpers.js` no
longer importing from `Track.js`, and `Track.js` importing `eventBus` from
`./eventBus.js` instead of `./helpers.js`.

**Non-goal:** do not change `mergePatches`'/`switchToTrack`'s internal logic at all —
this is a pure file-move, verify via `git diff` that the only changes are import
paths and file boundaries, zero logic diff. If a logic change feels necessary while
moving, stop and report it instead of bundling it in — a "just moving files" commit
with a hidden logic change is exactly the kind of unrequested scope creep that needs
a second look before merging.

---

## R-21 — Delete confirmed-dead code

Delete outright (not comment out, not deprecate-in-place):

1. `src/engines/engineCore.js` — confirm zero importers first:
   ```bash
   grep -rln "engineCore\|createEngineCore" src --include=*.js --include=*.jsx | grep -v engineCore.js
   ```
   Expect no output. If anything imports it, STOP — do not delete, report back.
2. The v3 `MotionInstance` branch inside `useMotionSubscribers.subscribeToSource` —
   locate via:
   ```bash
   grep -n "MotionInstance" src/hooks/useMotionSubscribers.js
   ```
   Remove the branch, keep the v4 `Track`-shaped path only.
3. `buildTrackTweenSync` / `composePatch` migration aliases — locate via:
   ```bash
   grep -rn "buildTrackTweenSync\|composePatch\b" src --include=*.js | grep -v __tests__
   ```
   If these are pure re-export aliases pointing at the real v4 function names,
   delete the alias and update any remaining call sites to the real name directly.

**Non-goal:** do not go hunting for additional dead code beyond these three named
items. R-21 is scoped to what the review already identified — a broader dead-code
sweep is not part of Phase 1.

---

## Mandatory verification checklist (run after ALL of the above, in order)

```bash
# 1. Fresh install, confirm no build break from the R-05 file moves
npm ci

# 2. Full suite — expect 100% pass, including the 4 new integration tests
npx vitest run

# 3. Confirm the app actually builds (catches the exact class of bug found last
#    session: deleting/moving a module other files still import breaks the whole
#    static import graph, not just the call site)
npx vite build

# 4. Re-run every Step 0 grep — confirm each one's expectation has flipped
grep -rn "validateProject" src --include=*.js | grep -v __tests__ | grep -v "src/validators/"
# EXPECT NOW: Engine.js only

grep -n "effectiveId = id ?? motionId" src/validators/rules/motion-structure.js
# EXPECT NOW: no output

sed -n '97,107p' src/lib/TriggerDelegate.js
# EXPECT NOW: delay and paused referenced

grep -n "unmount(" src/engines/Engine.js
# EXPECT NOW: 1+ matches

grep -n "^import" src/lib/Track.js src/lib/helpers.js
# EXPECT NOW: no import of Track.js inside helpers.js

grep -rln "schemaVersion: 2" src/components
# EXPECT NOW: no output

grep -n "duration:" src/components/Spiral/spiralMotions.js
# EXPECT NOW: only track-level duration fields remain, no trigger.duration

# 5. Manually load each of the 7 demo pages in dev mode, confirm no console errors
#    on mount (validator now runs on every one of them for the first time — this
#    is the step most likely to surface something Step 0 didn't anticipate)
npm run dev
# visit each: Demo, Burst, PasarMalam, PasarMalamObserver, Motorcycle, Spiral, TowerDefense
```

**Report back:** full `git diff --stat` for the whole phase, plus explicit
confirmation of every checklist item above with actual command output — not
"should be fine," actual pasted output, per standing methodology (never trust
commit messages or memory, verify via fresh clone + grep + vitest).
