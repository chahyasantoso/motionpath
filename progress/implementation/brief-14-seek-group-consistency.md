# Brief 14 — Make `seek()` consistent with `play()`/`pause()` for timeline-group members

**Priority: LOW.** Not a live bug today (nothing in production code currently calls `MotionInstance.seek()`), but it's an API inconsistency that will silently misbehave the moment something does call it. Cheap to fix now.
**Branch:** `v3`
**Files touched:** `src/engines/ProductionEngine.js`, `src/engines/__tests__/ProductionEngine.test.js`

---

## The problem

`ProductionEngine._onInstanceMounted()` patches `instance.play` and `instance.pause` for timeline-group members so they control the group's master timeline (via `TimelineGroupController`) instead of the member's own child timeline:

```js
_onInstanceMounted(instance, groupSpec) {
  if (groupSpec) {
    const controller = this._groups.get(groupSpec.timelineId);
    instance.play = () => controller.play();
    instance.pause = () => controller.pause();
  }
}
```

It does **not** patch `instance.seek`. `MotionInstance.seek(progress)` always calls `this.timeline.progress(progress)` — the member's own nested child timeline — regardless of whether that instance belongs to a group. `TimelineGroupController` already exposes a `seek(progress)` method that correctly targets the master timeline and clamps `progress` to `[0, 1]`; `ProductionEngine` just isn't wiring it up.

This mirrors exactly the `play`/`pause` case that was already fixed for the same reason. Right now this is dormant because nothing calls `.seek()` on a `ProductionEngine`-mounted instance (only `EditorEngine.setProgress()` seeks, and it already resolves at the group level correctly via its own group-aware code path — that part does not need to change). But if `seek()` is ever exposed on the production API surface (e.g. a "scrub preview" feature, or a hook that lets a consumer manually set progress on a playing instance), a non-primary group member's `seek()` would silently desync from the rest of the group instead of throwing or behaving predictably.

## Locked decision

Patch `instance.seek` the same way `play`/`pause` are patched, delegating to `controller.seek(progress)`.

## Non-goals

- Do NOT change `TimelineGroupController.seek()` — it's already correct (clamps to `[0,1]`, targets `masterTimeline`). No changes needed there.
- Do NOT change `EditorEngine.setProgress()` or its group-resolution logic — that path already works correctly and is out of scope for this brief.
- Do NOT change `MotionInstance.seek()` itself — ungrouped instances must keep calling `this.timeline.progress(progress)` directly, unchanged.
- Do NOT add clamping to `MotionInstance.seek()` — that's a separate, unrelated behavior change not requested here. Only the group-delegation wiring is in scope.

## WRONG (current code)

```js
// src/engines/ProductionEngine.js
import { BaseEngine } from "./BaseEngine.js";

export class ProductionEngine extends BaseEngine {
  _configForMount(motionId, config, groupSpec) {
    return groupSpec ? { ...config, _suppressDriver: true } : config;
  }

  _onInstanceMounted(instance, groupSpec) {
    if (groupSpec) {
      const controller = this._groups.get(groupSpec.timelineId);
      instance.play = () => controller.play();
      instance.pause = () => controller.pause();
    }
  }
}

export function createProductionEngine(deps) {
  return new ProductionEngine(deps);
}

export const productionEngine = new ProductionEngine();
export default productionEngine;
```

## CORRECT (replace the whole file with this)

```js
// src/engines/ProductionEngine.js
import { BaseEngine } from "./BaseEngine.js";

export class ProductionEngine extends BaseEngine {
  _configForMount(motionId, config, groupSpec) {
    return groupSpec ? { ...config, _suppressDriver: true } : config;
  }

  _onInstanceMounted(instance, groupSpec) {
    if (groupSpec) {
      const controller = this._groups.get(groupSpec.timelineId);
      instance.play = () => controller.play();
      instance.pause = () => controller.pause();
      instance.seek = (progress) => controller.seek(progress);
    }
  }
}

export function createProductionEngine(deps) {
  return new ProductionEngine(deps);
}

export const productionEngine = new ProductionEngine();
export default productionEngine;
```

## Test addition

Add this test inside the existing `describe` block that contains `'play/pause on grouped instance controls master'` in `src/engines/__tests__/ProductionEngine.test.js` (same file, same nesting level — do not create a new top-level `describe`). Reuse the exact `timeGroupSchema` fixture already defined in that neighboring test rather than redefining it.

```js
it("seek on grouped instance controls master, not the member's own timeline", async () => {
  validatorModule.validateProject.mockReturnValue([]);
  const engine = createProductionEngine(mockDeps);

  const timeGroupSchema = {
    templates: [],
    motions: [
      {
        motionId: "tg-a",
        driver: {
          type: "timeline",
          timelineId: "time-group",
          trigger: { type: "time", duration: 1 },
        },
        tracks: [
          {
            id: "tg-track-a",
            keyframes: {
              x: {
                stops: [
                  { p: 0, v: 0 },
                  { p: 1, v: 10 },
                ],
              },
            },
          },
        ],
      },
      {
        motionId: "tg-b",
        driver: {
          type: "timeline",
          timelineId: "time-group",
          primary: true,
          trigger: { type: "time", duration: 1, repeat: 0 },
        },
        tracks: [
          {
            id: "tg-track-b",
            keyframes: {
              y: {
                stops: [
                  { p: 0, v: 0 },
                  { p: 1, v: 20 },
                ],
              },
            },
          },
        ],
      },
    ],
  };

  await engine.loadProject(timeGroupSchema);

  const instA = engine.mountInstance("tg-a");
  const instB = engine.mountInstance("tg-b");

  expect(typeof instA.seek).toBe("function");
  expect(typeof instB.seek).toBe("function");

  const memberOwnProgressSpy = vi.spyOn(instA.timeline, "progress");

  instA.seek(0.5);

  // The member's own nested timeline must NOT have been driven directly —
  // seek() on a grouped instance must go through the master, exactly like
  // play()/pause() already do.
  expect(memberOwnProgressSpy).not.toHaveBeenCalledWith(0.5);
});
```

## Verification checklist

```bash
git clone --branch v3 https://github.com/chahyasantoso/motionpath.git /tmp/verify14
cd /tmp/verify14

# 1. Confirm the wiring landed
grep -n "instance.seek = (progress) => controller.seek(progress);" src/engines/ProductionEngine.js
# expect: 1 hit

# 2. Confirm nothing else in the file changed shape
grep -c "controller.play()\|controller.pause()\|controller.seek(progress)" src/engines/ProductionEngine.js
# expect: 3

# 3. Confirm the new test was added in the right describe block (not a stray new file/top-level block)
grep -n "seek on grouped instance controls master" src/engines/__tests__/ProductionEngine.test.js
# expect: 1 hit

# 4. Full suite must still be green
npm install
npx vitest run
# expect: all test files passing, including the new seek test
```
