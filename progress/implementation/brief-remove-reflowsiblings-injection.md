# Brief: remove `reflowSiblings` dependency injection (unused, YAGNI)

Confirmed via grep across the whole `src` tree: nothing in the actual app —
no engine construction call, no demo, no hook — ever passes `reflowSiblings`.
It was added speculatively as a customization seam without a concrete need;
what it was meant to cover (reflow duration/ease) is already fully handled
by `schemaMotion.staggerTransition`, which is schema _data_ and therefore
portable to a future non-JS engine, unlike an injected function. Removing it.

**Files to edit:** `src/domain/instance/MotionInstance.js`, `src/engines/BaseEngine.js`
**Tests to edit:** `src/domain/instance/__tests__/MotionInstance.test.js`

---

## Locked decisions

1. `MotionInstance.#defaultReflow` becomes the **only** reflow
   implementation — no swappable dependency. It keeps reading
   `schemaMotion.staggerTransition` for duration/ease exactly as it does now
   — that part is unaffected, only the function-injection layer is removed.
2. `BaseEngine` no longer accepts or forwards a `reflowSiblings` dep.
3. If a genuinely different reflow _mechanism_ (not just duration/ease) is
   needed later, it gets designed then, as its own scoped brief — do not
   leave a partial/commented-out version of this plumbing "just in case."
   Remove it cleanly.

## Non-goals

- Do **not** touch `staggerTransition` handling — that stays exactly as is,
  it's unrelated to this removal.
- Do **not** remove or rename `#staggerDelay`, `isAutoStagger`, or anything
  else from the composition work. This brief only removes the
  function-injection seam, nothing else.
- Do **not** add a `transitionType` field or any new schema concept as part
  of this brief. That's a separate, not-yet-scoped future discussion.

---

## Change 1 — `MotionInstance.js` constructor: stop reading `context.reflowSiblings`

**WRONG (current):**

```js
this.deps = {
  resolveElement: context.resolveElement,
  mountInstance: context.mountInstance,
  reflowSiblings: context.reflowSiblings,
};
```

**CORRECT:**

```js
this.deps = {
  resolveElement: context.resolveElement,
  mountInstance: context.mountInstance,
};
```

---

## Change 2 — `#reflowSiblings`: drop the injectable fallback, call `#defaultReflow` directly

**WRONG (current):**

```js
  #reflowSiblings(targets) {
    const reflow = this.#deps.reflowSiblings ?? MotionInstance.#defaultReflow;
    const transition = this.schemaMotion.staggerTransition ?? {};
    return Promise.resolve(reflow(targets, this.timeline, transition));
  }
```

**CORRECT:**

```js
  #reflowSiblings(targets) {
    const transition = this.schemaMotion.staggerTransition ?? {};
    return MotionInstance.#defaultReflow(targets, this.timeline, transition);
  }
```

`#defaultReflow` itself (the `static` method with the `gsap.to` calls) does
not change at all — it already returns a `Promise` via `Promise.all(...)`,
so the `Promise.resolve(...)` wrapper (which existed only to normalize a
possibly-non-promise custom function) is no longer needed.

---

## Change 3 — `BaseEngine.js`: remove the field, constructor read, and context forwarding

**WRONG (current, fields + constructor):**

```js
  #resolveElement;
  #reflowSiblings;

  constructor(deps = {}) {
    this.#resolveElement = deps.resolveElement ?? ((id) => {
      const ref = this._triggerRefs.get(id);
      if (!ref || !ref.current) {
        throw new Error(
          `MotionPath: trigger ref '${id}' is not registered. ` +
          `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
          `before this project's scenarios are wired.`
        );
      }
      return ref.current;
    });
    this.#reflowSiblings = deps.reflowSiblings;
  }
```

**CORRECT:**

```js
  #resolveElement;

  constructor(deps = {}) {
    this.#resolveElement = deps.resolveElement ?? ((id) => {
      const ref = this._triggerRefs.get(id);
      if (!ref || !ref.current) {
        throw new Error(
          `MotionPath: trigger ref '${id}' is not registered. ` +
          `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
          `before this project's scenarios are wired.`
        );
      }
      return ref.current;
    });
  }
```

**WRONG (current, inside `mountInstance`'s context object):**

```js
const instance = createMotionInstance(motionId, effectiveConfig, {
  project: this._project,
  resolveElement: this.#resolveElement,
  mountInstance: (childMotionId, childConfig) => {
    return this.mountInstance(childMotionId, childConfig);
  },
  onSubscriberChange,
  reflowSiblings: this.#reflowSiblings,
});
```

**CORRECT:**

```js
const instance = createMotionInstance(motionId, effectiveConfig, {
  project: this._project,
  resolveElement: this.#resolveElement,
  mountInstance: (childMotionId, childConfig) => {
    return this.mountInstance(childMotionId, childConfig);
  },
  onSubscriberChange,
});
```

---

## Test file changes — `src/domain/instance/__tests__/MotionInstance.test.js`

### `createTestInstance`: stop threading `reflowSiblings` through

**WRONG (current):**

```js
function createTestInstance(motionId, config, schemaMotion) {
  const { reflowSiblings, mountInstance, ...restConfig } = config || {};
  return new MotionInstance(motionId, restConfig, schemaMotion, {
    project: { templates },
    resolveElement: mockDeps.resolveElement,
    mountInstance: mountInstance || mockDeps.mountInstance,
    onSubscriberChange: mockOnSubscriberChange,
    reflowSiblings,
  });
}
```

**CORRECT:**

```js
function createTestInstance(motionId, config, schemaMotion) {
  const { mountInstance, ...restConfig } = config || {};
  return new MotionInstance(motionId, restConfig, schemaMotion, {
    project: { templates },
    resolveElement: mockDeps.resolveElement,
    mountInstance: mountInstance || mockDeps.mountInstance,
    onSubscriberChange: mockOnSubscriberChange,
  });
}
```

### Delete this test entirely — it tests the feature being removed

```js
it('uses an injected reflowSiblings function instead of the default tween', async () => {
  ...
});
```

### Rewrite this test — it currently relies on `reflowSiblings` injection purely

as a way to control timing in the test, not because the test is actually
about custom reflow. Replace with spying on `gsap.to` directly and manually
invoking the captured `onComplete` to simulate the tween finishing:

**WRONG (current):**

```js
it("onChildChange fires for removeChild only after reflow completes, not at splice time", async () => {
  const customReflow = vi.fn().mockResolvedValue(undefined);
  const instance = createTestInstance(
    "time-motion",
    { reflowSiblings: customReflow },
    timelineSchema,
  );
  const child1 = instance.addChild("child-motion", {});

  const listener = vi.fn();
  instance.onChildChange(listener);
  instance.removeChild(child1);

  expect(listener).not.toHaveBeenCalled(); // reflow (mocked) hasn't resolved yet

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(listener).toHaveBeenCalledTimes(1);
});
```

**CORRECT:**

```js
it("onChildChange fires for removeChild only after reflow completes, not at splice time", async () => {
  const instance = createTestInstance("time-motion", {}, timelineSchema);
  const child1 = instance.addChild("child-motion", {});
  instance.addChild("child-motion", {}); // survivor — gives the reflow something to do

  let capturedOnComplete;
  const toSpy = vi.spyOn(gsap, "to").mockImplementation((target, vars) => {
    capturedOnComplete = vars.onComplete;
    return { kill: vi.fn() };
  });

  const listener = vi.fn();
  instance.onChildChange(listener);
  instance.removeChild(child1);

  expect(listener).not.toHaveBeenCalled(); // reflow tween hasn't completed yet

  capturedOnComplete(); // simulate the tween finishing
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(listener).toHaveBeenCalledTimes(1);
  toSpy.mockRestore();
});
```

Note: `gsap` must be imported in this test file already (`import { gsap } from
'gsap';` — check the top of the file; it's used elsewhere, e.g. the
`staggerTransition` test already does `vi.spyOn(gsap, 'to')` the same way).
Follow that exact same pattern, don't introduce a second one.

---

## Verification checklist

```bash
# 1. reflowSiblings is completely gone from both files
grep -rn "reflowSiblings" src --include=*.js
# Expect: 0 matches anywhere in src (tests included)

# 2. #defaultReflow is still the implementation, still reads staggerTransition
grep -n "#defaultReflow\|staggerTransition" src/domain/instance/MotionInstance.js
# Expect: #defaultReflow definition + call site, staggerTransition read — unchanged from before this brief

# 3. Full suite passes, count reflects one test deleted + one test rewritten (not net-added)
npx vitest run src/domain/instance/__tests__/MotionInstance.test.js
npx vitest run src/engines/__tests__/
```

Report actual grep output and both test run summaries.
