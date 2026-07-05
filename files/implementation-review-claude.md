# MotionPath — Fix Plan (Round 3)

**Status:** Three small, independent fixes. Standalone document — implement against this only, no other context needed. None of these require touching schema, `builder.js`'s merge logic, or either engine's trigger-wiring logic — all three are scoped exactly to what's below.

**Do not expand scope.** Each task lists exactly which file(s) change. If a fix seems like it should also touch something else, it's out of scope for this round — flag it instead of fixing it.

---

## Task 1 — Complete the uniform rule signature (finish Brief 1 Addendum A)

**File:** `validators/index.js` only. No rule file changes needed for this task.

**Problem:** the signature-sniffing hack was correctly removed from `ease-collision.js`, `stagger-shape.js`, and `trigger-shape.js`. But the orchestrator still calls element rules and cross-scenario rules inconsistently:

```js
// current — element rules get 3 args, no context
for (const rule of elementRules) {
  errors.push(...runSafely(rule, element, scenario, elementPath));
}
// current — cross-scenario rules get 1 arg, no context
for (const rule of crossScenarioRules) {
  errors.push(...runSafely(rule, schema.scenarios));
}
```

**Fix — pass `context` uniformly everywhere, matching how scenario rules already receive it:**

```js
// element rules: (element, scenario, context, path)
for (const rule of elementRules) {
  errors.push(...runSafely(rule, element, scenario, context, elementPath));
}
// cross-scenario rules: (scenarios, context)
for (const rule of crossScenarioRules) {
  errors.push(...runSafely(rule, schema.scenarios, context));
}
```

`context` here is the same `{ schema }` object already constructed for scenario rules — reuse it, don't build a second one.

**Also update the three affected rule files' signatures to accept (and ignore) the new parameter**, so nothing breaks positionally:

```js
// direction-ambiguity.js, path-xy-exclusivity.js, path-shape.js
export function directionAmbiguityRule(element, scenario, context, path) { /* body unchanged, context unused */ }

// timeline-group.js, element-uniqueness.js
export function timelineGroupRule(scenarios, context) { /* body unchanged, context unused */ }
```

**Do not add any logic that uses `context` in these five rules.** None of them need it today. This task is purely about making every rule's call signature consistent — so the *next* rule that does need `context` doesn't face the same choice that caused the original sniffing bug.

**Test to add** — one shared test in `validators/__tests__/index.test.js`, not per-rule:

```js
import { directionAmbiguityRule } from '../rules/direction-ambiguity.js';
import { pathXYExclusivityRule } from '../rules/path-xy-exclusivity.js';
import { pathShapeRule } from '../rules/path-shape.js';
import { timelineGroupRule } from '../rules/timeline-group.js';
import { elementUniquenessRule } from '../rules/element-uniqueness.js';
import { triggerShapeRule } from '../rules/trigger-shape.js';
import { easeCollisionRule } from '../rules/ease-collision.js';
import { staggerShapeRule } from '../rules/stagger-shape.js';
import { perspectiveUsageRule } from '../rules/perspective-usage.js';

it('every rule function has the correct arity for its type', () => {
  const scenarioRules = [triggerShapeRule, easeCollisionRule, staggerShapeRule, perspectiveUsageRule];
  const elementRules = [directionAmbiguityRule, pathXYExclusivityRule, pathShapeRule];
  const crossScenarioRules = [timelineGroupRule, elementUniquenessRule];

  scenarioRules.forEach(rule => expect(rule.length).toBe(3));   // (scenario, context, path)
  elementRules.forEach(rule => expect(rule.length).toBe(4));    // (element, scenario, context, path)
  crossScenarioRules.forEach(rule => expect(rule.length).toBe(2)); // (scenarios, context)
});
```

This test exists specifically to catch a regression back to signature-sniffing automatically, without needing a human to notice it in review again.

---

## Task 2 — Add the missing rollback test for `ProductionEngine`

**File:** `lib/__tests__/ProductionEngine.test.js` only. `ProductionEngine.js` itself is already correct — this is a test-coverage gap, not a bug fix.

**Add this test**, modeled on the existing grouped-scrub test's mock setup:

```js
it('kills all timelines built so far if trigger-wiring throws partway through', async () => {
  const scenarioA = { scenarioIndex: 0, sceneId: 'a', triggerType: 'scroll-scrub',
    triggerConfig: { trigger: '#a', scrub: true }, timeline: { kill: vi.fn(), progress: vi.fn() } };
  const scenarioB = { scenarioIndex: 1, sceneId: 'b', triggerType: 'scroll-scrub',
    triggerConfig: { trigger: '#b', scrub: true }, timeline: { kill: vi.fn(), progress: vi.fn() } };

  const buildResult = {
    scenarios: [scenarioA, scenarioB],
    timelineGroups: new Map(),
    elements: new Map(),
    elementPlugins: new Map(),
  };

  validatorModule.validateProject.mockReturnValue([]);
  builderModule.buildProject.mockResolvedValue(buildResult);

  // First ScrollTrigger.create succeeds, second throws
  ScrollTrigger.create
    .mockImplementationOnce(() => ({ kill: vi.fn() }))
    .mockImplementationOnce(() => { throw new Error('boom'); });

  const engine = createProductionEngine(mockDeps);

  await expect(engine.loadProject({})).rejects.toThrow('boom');

  // Both timelines — including scenario A's, which was already wired before B failed — must be killed.
  expect(scenarioA.timeline.kill).toHaveBeenCalled();
  expect(scenarioB.timeline.kill).toHaveBeenCalled();
});
```

Adjust mock shapes to match whatever conventions the rest of the file already uses — the point is the assertion (both timelines killed after a mid-loop failure), not the exact mock syntax.

---

## Task 3 — Replay current state immediately on `subscribe()` (replaces the need for the legacy `_cache` Map)

**File:** `lib/engineCore.js` only.

**Problem:** a new subscriber currently waits for the next `gsap.ticker` tick to receive any value. This is usually fine in production (~16ms), but is a real gap for `EditorEngine` (paused timelines by design), backgrounded browser tabs (rAF throttling), and test environments using fake timers that may never advance the ticker. The old `motionEngine.js` solved this with a separate `_cache` Map — **do not port that.** It's redundant: `builder.js` already seeds each element's `proxy` with the correct merged initial values at build time, and GSAP continuously mutates that same object afterward. `proxy` already *is* the current cached state; a second Map would just be a second copy that could drift from it.

**Fix — one synchronous replay call, no new state:**

```js
subscribe(elementId, callback) {
  if (!buildResult.elements.has(elementId)) {
    throw new Error(`subscribe: element "${elementId}" not found in buildResult.`);
  }
  if (!subscribers.has(elementId)) {
    subscribers.set(elementId, new Set());
  }
  subscribers.get(elementId).add(callback);
  if (totalSubscriberCount() === 1) startTicker();

  // Replay current state immediately so a new subscriber never waits on the
  // next tick, which may be arbitrarily delayed (paused editor timeline,
  // backgrounded tab, fake timers in tests). `proxy` is already always current.
  callback({ ...buildResult.elements.get(elementId).proxy });

  return () => {
    const cbs = subscribers.get(elementId);
    if (cbs) {
      cbs.delete(callback);
      if (totalSubscriberCount() === 0) stopTicker();
    }
  };
}
```

**Non-goal: do not add a cache Map, do not add a "last broadcast" field anywhere.** The fix is exactly the one added line (`callback({ ...buildResult.elements.get(elementId).proxy });`) — nothing else about `subscribe()` changes.

**Test to add**, in `lib/__tests__/engineCore.test.js`:

```js
it('replays current proxy state synchronously on subscribe, before any tick', () => {
  const core = createEngineCore(buildResult); // use existing test fixture
  const callback = vi.fn();
  core.subscribe('some-element-id', callback);
  // No gsap.ticker advance here — zero ticks have occurred.
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(expect.objectContaining(/* seeded proxy values from fixture */));
});
```

---

## Summary for the person running this

Three independent, small, low-risk fixes — none touch schema, validation logic, or trigger-wiring behavior:

1. `validators/index.js` + 5 rule files — pass `context` uniformly, add one arity regression test.
2. `ProductionEngine.test.js` — add the one missing rollback test (code is already correct).
3. `engineCore.js` — one line in `subscribe()` to replay current state immediately, replacing the need for a separate cache.

All three can be done in any order, by the same or different sessions, without conflicts.
