# Brief: public `isDestroyed` getter on MotionInstance

Small, additive change. Closes the open question left in
`MotionInstance-Composition-API-Contract.md` §6: consumers holding a stale
instance reference currently have no defensive way to check "is this thing
dead" before calling `subscribe()` (which throws if it is).

**File to edit:** `src/domain/instance/MotionInstance.js`
**Test to edit:** `src/domain/instance/__tests__/MotionInstance.test.js`

---

## Locked decisions

1. Add a public, read-only getter `isDestroyed` that returns the existing
   private `#destroyed` field. No new state — this exposes what already
   exists internally.
2. This is purely additive. Nothing about `destroy()`, `addChild`,
   `removeChild`, or any existing throw behavior changes. Do not make
   `subscribe()`/`addChild()` start using this getter internally instead of
   their own direct `this.#destroyed` checks — leave those as they are, this
   getter is for external consumers, not a refactor of internal checks.

## Non-goals

- Do **not** add an `onDestroy` callback/event. Not requested — if a
  consumer needs to react to destruction, that's a separate, bigger
  feature (would need to decide ordering relative to `#childListeners`,
  `#onSubscriberChange`, etc.) and isn't in scope here.
- Do **not** make `subscribe()` check `isDestroyed` and return a no-op
  instead of throwing. The existing throw-on-destroyed-subscribe behavior is
  unchanged; this getter only gives consumers a way to check *before*
  calling subscribe, not a way to make subscribe itself more forgiving.
- Do **not** add this getter to any other class (engines, etc.) as part of
  this brief. `MotionInstance` only.

---

## Change — add the getter

Add it near the other public getter already in the file, for consistency:

**WRONG (current, end of file):**
```js
  get requiredTriggerIds() {
    const trigger = this.schemaMotion.driver?.trigger || {};
    const ids = [];
    ['trigger', 'startTrigger', 'endTrigger', 'pin'].forEach(key => {
      const val = trigger[key];
      if (typeof val === 'string' && val !== '') {
        ids.push(val);
      }
    });
    return ids;
  }
}
```

**CORRECT:**
```js
  get requiredTriggerIds() {
    const trigger = this.schemaMotion.driver?.trigger || {};
    const ids = [];
    ['trigger', 'startTrigger', 'endTrigger', 'pin'].forEach(key => {
      const val = trigger[key];
      if (typeof val === 'string' && val !== '') {
        ids.push(val);
      }
    });
    return ids;
  }

  get isDestroyed() {
    return this.#destroyed;
  }
}
```

---

## Test file changes

Add to the existing `describe('Teardown and destruction', ...)` block:

```js
it('exposes isDestroyed as false before destroy() and true after', () => {
  const instance = createTestInstance('time-motion', {}, timelineSchema);

  expect(instance.isDestroyed).toBe(false);

  instance.destroy();

  expect(instance.isDestroyed).toBe(true);
});
```

---

## Verification checklist

```bash
# 1. Getter exists, returns the private field, nothing else changed
grep -n "get isDestroyed" src/domain/instance/MotionInstance.js
# Expect: exactly 1 match

# 2. No internal call site was changed to use the new getter
grep -n "this.isDestroyed" src/domain/instance/MotionInstance.js
# Expect: 0 matches — internal code still uses this.#destroyed directly

# 3. Full suite passes, count includes the one new test
npx vitest run src/domain/instance/__tests__/MotionInstance.test.js
```

Report actual grep output and the test count, not a summary.
