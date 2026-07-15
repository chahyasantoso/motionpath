# Brief: engine-layer config wiring fixes

Two independent, pre-existing bugs found while reviewing the engine layer for
the `MotionInstance` reflow work. Neither depends on the other. Both are
small, targeted fixes — no new abstractions.

**Files to edit:** `src/engines/MotionInstance.js` is NOT touched here — only
`src/domain/instance/MotionInstance.js` (one line), `src/engines/BaseEngine.js`,
and confirm `src/engines/ProductionEngine.js` / `src/engines/EditorEngine.js`
need no change (they shouldn't, per the analysis below — verify, don't assume).

---

## Bug 1 — stale flag name: `_groupMember` vs `_suppressDriver`

`src/domain/instance/MotionInstance.js` checks `config._groupMember` in two
places inside `#setupDriver`. Nothing anywhere in the codebase ever sets
`_groupMember`. Both `ProductionEngine._configForMount` and
`EditorEngine._configForMount` set `config._suppressDriver = true` for group
members instead. Result: today, in production, a `timelineId` group member
(non-primary) that isn't also a composition child (`parentId`) incorrectly
gets its own `ScrollTrigger`/autoplay — the exact thing group membership is
supposed to prevent.

**Locked decision:** rename the check in `MotionInstance.js` to match what
the engines actually set. Do not touch `ProductionEngine.js` or
`EditorEngine.js` — `_suppressDriver` is the correct, already-consistent name
on that side; `MotionInstance.js` is the one that drifted.

### If you have NOT yet applied the `#ownsTrigger()` extraction (Change 5 of
`brief-motioninstance-reflow-addendum.md`), do this first, as plain WRONG/CORRECT:

**WRONG:**
```js
      const shouldPlay = !config.parentId && !config._groupMember && (config.autoplay ?? true);
```
```js
      if (!config.parentId && !config._groupMember) {
```

**CORRECT:**
```js
      const shouldPlay = !config.parentId && !config._suppressDriver && (config.autoplay ?? true);
```
```js
      if (!config.parentId && !config._suppressDriver) {
```

### If you HAVE already applied that addendum's `#ownsTrigger()` extraction,
fix it there instead — same rename, one place:

**WRONG:**
```js
  #ownsTrigger(config) {
    return !config.parentId && !config._groupMember;
  }
```

**CORRECT:**
```js
  #ownsTrigger(config) {
    return !config.parentId && !config._suppressDriver;
  }
```

Only make ONE of these two edits, whichever matches the actual current state
of the file — check first, don't guess.

---

## Bug 2 — `reflowSiblings` dependency never reaches `MotionInstance` in production

This only matters if `brief-motioninstance-reflow.md`'s `context.reflowSiblings`
constructor read has already been applied to `MotionInstance.js`. If it
hasn't been applied yet, skip this section for now — there's nothing to wire
until that exists.

`BaseEngine` already has an established pattern for exactly this kind of
thing — `resolveElement` is accepted in the constructor's `deps`, stored
privately, and forwarded into every `mountInstance` call's context.
`reflowSiblings` needs the identical treatment; it currently isn't threaded
through at all.

**WRONG (current, `src/engines/BaseEngine.js`):**
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

**CORRECT:**
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

Note `this.#reflowSiblings = deps.reflowSiblings` with no `?? fallback` —
`undefined` is the correct default here. `MotionInstance`'s own constructor
already falls back to its internal default when `context.reflowSiblings` is
`undefined` (that's the base brief's `#reflowSiblings` method:
`this.#deps.reflowSiblings ?? MotionInstance.#defaultReflow`). Don't
duplicate that fallback at this layer too.

**WRONG (current, `mountInstance` method, same file):**
```js
    const instance = createMotionInstance(motionId, effectiveConfig, {
      project: this._project,
      resolveElement: this.#resolveElement,
      mountInstance: (childMotionId, childConfig) => {
        return this.mountInstance(childMotionId, childConfig);
      },
      onSubscriberChange
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
      reflowSiblings: this.#reflowSiblings
    });
```

## Non-goals

- Do **not** add a `reflowSiblings` setter, or a way to change it after
  engine construction. It's a constructor-time dep, same lifecycle as
  `resolveElement`.
- Do **not** touch `ProductionEngine.js` or `EditorEngine.js` for Bug 2 —
  neither overrides `mountInstance` or constructs its own context object;
  confirm this by reading both files before concluding no change is needed
  there, don't just take this brief's word for it.
- Do **not** rename `_suppressDriver` to `_groupMember` (i.e. fix it in the
  engines instead of `MotionInstance.js`) — `_suppressDriver` is also used
  correctly as the name in both engines' `_configForMount`; `MotionInstance.js`
  is the file that's wrong.

## Regression test — add to `src/domain/instance/__tests__/MotionInstance.test.js`

Nothing today asserts this boundary at all, which is exactly how the bug went
unnoticed. Add this inside the existing `describe('Scroll Trigger Specific API', ...)`
block, using the same `createTestInstance(motionId, config, schemaMotion)`
pattern already used by every other test in that block:

```js
it('does NOT create its own ScrollTrigger when config._suppressDriver is set (timelineId group member)', () => {
  const scrollSchema = {
    motionId: 'scroll-motion',
    driver: {
      type: 'gsap-scroll',
      trigger: { trigger: '#el', scrub: true }
    },
    tracks: []
  };

  createTestInstance('scroll-motion', { _suppressDriver: true }, scrollSchema);
  expect(ScrollTrigger.create).not.toHaveBeenCalled();
});
```

This is the exact config shape `ProductionEngine._configForMount` and
`EditorEngine._configForMount` actually produce for a non-primary group
member (`{ ...config, _suppressDriver: true }`) — it directly exercises the
bug this brief fixes. If you run this test against the file *before* Bug 1's
fix, it should fail (proving the test is real, not vacuous); after the fix,
it should pass. Confirm both, don't just add it and check the final state.

## Verification checklist

```bash
# 1. _groupMember is completely gone from the codebase
grep -rn "_groupMember" src --include=*.js
# Expect: 0 matches anywhere

# 2. _suppressDriver is now checked in MotionInstance.js too, not just set by engines
grep -rn "_suppressDriver" src --include=*.js | grep -v __tests__
# Expect: 2 set-sites (ProductionEngine.js, EditorEngine.js) — unchanged —
#         PLUS 1-2 new check-sites in MotionInstance.js (either inline or
#         inside #ownsTrigger, depending on which state the file was in)

# 3. reflowSiblings is threaded from constructor through to mountInstance's context
grep -n "reflowSiblings" src/engines/BaseEngine.js
# Expect: deps.reflowSiblings read in constructor, #reflowSiblings field
#         declared, and passed into the createMotionInstance(...) call

# 4. Confirm ProductionEngine.js and EditorEngine.js needed no changes
grep -n "mountInstance\|createMotionInstance" src/engines/ProductionEngine.js src/engines/EditorEngine.js
# Expect: neither file defines its own mountInstance or calls
#         createMotionInstance directly — both inherit BaseEngine's

# 5. Full engine test suite passes
npx vitest run src/engines/__tests__/
```

Report actual grep output. This brief touches dependency wiring that unit
tests for `MotionInstance.js` alone cannot catch — a test constructing
`MotionInstance` directly with a hand-built `context` will pass regardless of
whether `BaseEngine` actually forwards `reflowSiblings`. If there's an
existing integration-style test that mounts through `ProductionEngine` end to
end, run it too and report its result specifically.
