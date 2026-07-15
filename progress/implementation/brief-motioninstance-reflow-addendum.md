# Addendum: custom-delay children + staggerTransition + DRY stagger formula

**Precondition:** apply `brief-motioninstance-reflow.md` first if you haven't
already. Everything below assumes that brief's `removeChild` / `#finishRemoval`
/ `#reflowSiblings` / `#defaultReflow` already exist in the file exactly as
specified there. The WRONG snippets below are that brief's CORRECT output,
not the original pristine source — verify you're looking at the right
version before editing.

**File to edit:** `src/domain/instance/MotionInstance.js`
**Tests to edit:** `src/domain/instance/__tests__/MotionInstance.test.js`

---

## Locked decisions (do not relitigate)

1. A child's delay is either **auto** (never given an explicit `delay` at
   `addChild` time — computed from stagger position) or **custom** (an
   explicit `config.delay` was passed). This must be tracked per child via a
   new `isAutoStagger` boolean property set once at `addChild` time and never
   changed afterward by `removeChild`.
2. `removeChild`'s sibling reflow **only ever recomputes and animates auto
   children**. Custom children are never touched — no delay change, no
   `delayTween`, nothing added to the reflow's `targets` list.
3. The stagger-index used to compute an auto child's delay counts **only
   among other auto children**, not the full `this.children` array. A custom
   child sitting between two auto children does not consume an index slot.
4. The reflow's `duration`/`ease` must come from `this.schemaMotion.staggerTransition`
   when present, falling back to today's `{ duration: 0.6, ease: 'power2.out' }`
   only when the schema doesn't declare one.
5. The stagger delay formula (`index * stagger`) must exist in exactly one
   place — a private method both `addChild` and `removeChild` call. No
   duplicated formula.

6. `#setupDriver`'s two occurrences of `!config.parentId && !config._groupMember`
   collapse into one private `#ownsTrigger()` method. No behavior change —
   pure extraction.
7. A child's `currentDelay` and `isAutoStagger` are set by the child's own
   constructor, from `config`, not assigned onto the child from outside by
   `addChild` after `mountInstance` returns it. `addChild` passes the values
   through `config` instead of mutating the returned instance.

## Non-goals — do not build these

- Do **not** build a public "convert this child to uniform stagger" API.
  Not requested. If it's needed later it'll be its own brief.
- Do **not** change what happens when `targets` ends up empty (all remaining
  children are custom) — `Promise.all([])` resolving immediately and
  `#finishRemoval` proceeding straight to detach is correct, expected
  behavior, not a bug to guard against.
- Do **not** touch `#pendingRemovals`, `#destroyed`, or anything else from
  the base brief. This addendum only changes delay-tracking and the reflow's
  duration/ease source.
- Do **not** create a `ChildMotionInstance` subclass or any class hierarchy.
  "Child" is a relationship (an instance referenced in another instance's
  `.children[]`), not a type — a child can itself call `addChild()` and
  become a parent, so it needs the full `MotionInstance` surface regardless.
  If asked to reconsider this, the answer is no; this was already decided.

---

## Change 1 — add `#staggerDelay` helper (new private method)

Add this method anywhere among the other private methods (e.g. right above
`#reflowSiblings`):

```js
  #staggerDelay(index) {
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    return index * stagger;
  }
```

---

## Change 2 — `addChild`: track `isAutoStagger`, use the shared helper

**WRONG (current, inside `addChild`):**
```js
    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const childIndex = this.children.length;
    const calculatedDelay = targetConfig.delay ?? (childIndex * stagger);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: this.id
    });

    child.currentDelay = calculatedDelay;
    this.children.push(child);
```

**CORRECT:**
```js
    const isAutoStagger = targetConfig.delay === undefined;
    const autoIndex = this.children.filter(c => c.isAutoStagger).length;
    const calculatedDelay = targetConfig.delay ?? this.#staggerDelay(autoIndex);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: this.id
    });

    child.currentDelay = calculatedDelay;
    child.isAutoStagger = isAutoStagger;
    this.children.push(child);
```

Note `autoIndex` is computed from `this.children` **before** the new child is
pushed — same timing as the original `childIndex`, just filtered to auto
children only.

---

## Change 3 — `removeChild`: only reflow auto children, use the shared helper

**WRONG (current, the `removeChild` method as left by the base brief):**
```js
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1 || this.#pendingRemovals.has(child)) return;

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

    const stagger = this.schemaMotion.stagger ?? this.schemaMotion.driver?.stagger ?? 0;
    const targets = this.children.map((c, newIdx) => ({ child: c, delay: newIdx * stagger }));

    this.#finishRemoval(child, targets);
  }
```

**CORRECT:**
```js
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx === -1 || this.#pendingRemovals.has(child)) return;

    this.children.splice(idx, 1);
    this.#pendingRemovals.add(child);

    const targets = this.children
      .filter(c => c.isAutoStagger)
      .map((c, autoIdx) => ({ child: c, delay: this.#staggerDelay(autoIdx) }));

    this.#finishRemoval(child, targets);
  }
```

---

## Change 4 — `#reflowSiblings` / `#defaultReflow`: read `staggerTransition`

**WRONG (current, as left by the base brief):**
```js
  #reflowSiblings(targets) {
    const reflow = this.#deps.reflowSiblings ?? MotionInstance.#defaultReflow;
    return Promise.resolve(reflow(targets, this.timeline));
  }

  static #defaultReflow(targets, parentTimeline) {
    return Promise.all(targets.map(({ child, delay }) => {
      if (child.currentDelay === undefined) {
        child.currentDelay = child.config.delay || 0;
      }
      if (child.delayTween) child.delayTween.kill();

      return new Promise(resolve => {
        child.delayTween = gsap.to(child.timeline, {
          startTime: delay,
          duration: 0.6,
          ease: 'power2.out',
          onUpdate: () => {
            parentTimeline.time(parentTimeline.time());
          },
          onComplete: () => {
            child.currentDelay = delay;
            resolve();
          }
        });
      });
    }));
  }
```

**CORRECT:**
```js
  #reflowSiblings(targets) {
    const reflow = this.#deps.reflowSiblings ?? MotionInstance.#defaultReflow;
    const transition = this.schemaMotion.staggerTransition ?? {};
    return Promise.resolve(reflow(targets, this.timeline, transition));
  }

  static #defaultReflow(targets, parentTimeline, transition = {}) {
    const duration = transition.duration ?? 0.6;
    const ease = transition.ease ?? 'power2.out';

    return Promise.all(targets.map(({ child, delay }) => {
      if (child.currentDelay === undefined) {
        child.currentDelay = child.config.delay || 0;
      }
      if (child.delayTween) child.delayTween.kill();

      return new Promise(resolve => {
        child.delayTween = gsap.to(child.timeline, {
          startTime: delay,
          duration,
          ease,
          onUpdate: () => {
            parentTimeline.time(parentTimeline.time());
          },
          onComplete: () => {
            child.currentDelay = delay;
            resolve();
          }
        });
      });
    }));
  }
```

If you injected a custom `reflowSiblings` via `context.reflowSiblings` in a
test or elsewhere, its signature is now `(targets, parentTimeline, transition)`
— existing mocks that only destructure the first one or two args are
unaffected (JS ignores extra args), but note this for anyone writing a new
custom reflow.

---

## Change 5 — `#setupDriver`: extract `#ownsTrigger()`, pure DRY, no behavior change

**WRONG (current, two separate occurrences inside `#setupDriver`):**
```js
      // Auto-play if not a child instance and autoplay is enabled
      const shouldPlay = !config.parentId && !config._groupMember && (config.autoplay ?? true);
```
and, further down in the same method:
```js
      if (!config.parentId && !config._groupMember) {
```

**CORRECT:** add this private method (anywhere among the other private
methods):
```js
  #ownsTrigger(config) {
    return !config.parentId && !config._groupMember;
  }
```
then replace the two call sites:
```js
      // Auto-play if not a child instance and autoplay is enabled
      const shouldPlay = this.#ownsTrigger(config) && (config.autoplay ?? true);
```
```js
      if (this.#ownsTrigger(config)) {
```

Do not change anything else inside `#setupDriver` — same `driverType`
branches, same trigger resolution, same everything. This is extraction only.

---

## Change 6 — constructor owns `currentDelay`/`isAutoStagger`; `addChild` stops reaching into the child after construction

**WRONG (current constructor, as left by the base brief):**
```js
    this.templates = context.project?.templates || {};
    this.children = [];
    this.tracksMap = new Map();
    this.currentDelay = undefined;
    this.delayTween = null;
    this.paddingCallback = null;
```

**CORRECT:**
```js
    this.templates = context.project?.templates || {};
    this.children = [];
    this.tracksMap = new Map();
    this.currentDelay = config.delay ?? undefined;
    this.isAutoStagger = config.isAutoStagger ?? true;
    this.delayTween = null;
    this.paddingCallback = null;
```

`config` here is the constructor's own `config` parameter (already in scope
at this point in the constructor — same one used a few lines earlier for
`this.config = config || {}`). Default `isAutoStagger` to `true` when absent
— top-level instances (never in anyone's `.children[]`) will carry this field
unused, which is harmless; it's only ever read by a *parent* iterating its
own `.children`.

**WRONG (current `addChild`, as left by Change 2 of this same addendum):**
```js
    const isAutoStagger = targetConfig.delay === undefined;
    const autoIndex = this.children.filter(c => c.isAutoStagger).length;
    const calculatedDelay = targetConfig.delay ?? this.#staggerDelay(autoIndex);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      parentId: this.id
    });

    child.currentDelay = calculatedDelay;
    child.isAutoStagger = isAutoStagger;
    this.children.push(child);
```

**CORRECT:**
```js
    const isAutoStagger = targetConfig.delay === undefined;
    const autoIndex = this.children.filter(c => c.isAutoStagger).length;
    const calculatedDelay = targetConfig.delay ?? this.#staggerDelay(autoIndex);

    const child = this.#deps.mountInstance(targetMotionId, {
      ...targetConfig,
      delay: calculatedDelay,
      isAutoStagger,
      parentId: this.id
    });

    this.children.push(child);
```

The child now sets its own `currentDelay`/`isAutoStagger` in its constructor
(Change 6, above) from the `config` it was mounted with — `addChild` no
longer reaches into the returned instance and overwrites its fields after
the fact.

**Verify `mountInstance` actually forwards `config` through unchanged** —
check `BaseEngine.mountInstance` and whatever `CreateMotionInstance.js` does
with its `config` argument before constructing. If either of them
destructures specific known keys out of `config` instead of spreading the
whole object through to `new MotionInstance(motionId, config, ...)`, add
`isAutoStagger` (and confirm `delay`) to that allow-list. Do not assume it
passes through — check it.

---

## Test file changes

### Update this existing test if present (from the base brief)

`'uses an injected reflowSiblings function instead of the default tween'` —
no change needed to the assertion itself (`customReflow.mock.calls[0]` still
destructures fine with an extra 3rd arg present), but confirm it still passes.

### Add these new tests

```js
it('does not reflow a child that was given an explicit custom delay', async () => {
  const instance = createTestInstance('time-motion', {}, timelineSchema);
  const auto1 = instance.addChild('child-motion', {});
  const custom = instance.addChild('child-motion', { delay: 5 });

  instance.removeChild(auto1);

  expect(custom.delayTween).toBeNull(); // never touched by reflow
  expect(custom.currentDelay).toBe(5);  // untouched
});

it('auto children reindex among themselves, skipping custom children', () => {
  const instance = createTestInstance('time-motion', {}, timelineSchema);
  const auto1 = instance.addChild('child-motion', {});          // auto, index 0
  instance.addChild('child-motion', { delay: 99 });              // custom, ignored for indexing
  const auto2 = instance.addChild('child-motion', {});           // auto, index 1

  expect(auto1.currentDelay).toBe(0);
  expect(auto2.currentDelay).toBeCloseTo(0.1); // stagger=0.1 in timelineSchema, index 1 among autos
});

it('reads duration/ease from schemaMotion.staggerTransition when present', async () => {
  const schemaWithTransition = {
    ...timelineSchema,
    staggerTransition: { duration: 0.25, ease: 'power1.in' }
  };
  const instance = createTestInstance('time-motion', {}, schemaWithTransition);
  const child1 = instance.addChild('child-motion', {});
  instance.addChild('child-motion', {});

  instance.removeChild(child1);

  // gsap.to is mocked in this file — assert it was called with the schema's
  // duration/ease instead of the 0.6/power2.out fallback. Check the existing
  // gsap mock setup in this test file for how to inspect call args.
});
```

Check `timelineSchema`'s existing `stagger` value in the test file's fixtures
before asserting exact numbers in the second test above — adjust the expected
`0.1` if the fixture's stagger differs.

---

## Verification checklist (grep-based)

```bash
# 1. isAutoStagger is set in addChild and checked in removeChild
grep -n "isAutoStagger" src/domain/instance/MotionInstance.js
# Expect: set in addChild, filtered on in removeChild — at least 2 occurrences

# 2. Stagger formula exists in exactly one place
grep -n "index \* stagger\|idx \* stagger\|\* stagger" src/domain/instance/MotionInstance.js
# Expect: exactly 1 match, inside #staggerDelay

# 3. staggerTransition is actually read now (previously zero matches in this file)
grep -n "staggerTransition" src/domain/instance/MotionInstance.js
# Expect: at least 1 match, inside #reflowSiblings

# 4. No remaining hardcoded 0.6 / power2.out outside the fallback defaults
grep -n "0.6\|power2.out" src/domain/instance/MotionInstance.js
# Expect: only inside #defaultReflow's `?? 0.6` / `?? 'power2.out'` fallback lines

# 5. #ownsTrigger exists and both old inline checks are gone
grep -n "#ownsTrigger\|parentId && !config._groupMember" src/domain/instance/MotionInstance.js
# Expect: #ownsTrigger definition + 2 call sites = 3 matches for "#ownsTrigger";
#         0 matches for the raw "parentId && !config._groupMember" expression

# 6. addChild no longer mutates the child instance after mountInstance returns it
grep -n "child.currentDelay = \|child.isAutoStagger = " src/domain/instance/MotionInstance.js
# Expect: 0 matches inside addChild. (#defaultReflow's own
# `child.currentDelay = delay` inside onComplete is a different, legitimate
# case — the reflow updating a child's delay after ITS OWN tween completes —
# do not remove that one.)

# 7. Full suite passes, new tests included and actually run (check the count)
npx vitest run src/domain/instance/__tests__/MotionInstance.test.js
```

### One more test to add, for Change 5/6

```js
it('addChild passes isAutoStagger/delay through config instead of mutating the child after construction', () => {
  const mountInstanceSpy = vi.fn((motionId, config) => new MotionInstance(motionId, config, timelineSchema, testContext));
  const instance = createTestInstance('time-motion', { mountInstance: mountInstanceSpy }, timelineSchema);

  instance.addChild('child-motion', {});

  const [, configArg] = mountInstanceSpy.mock.calls[0];
  expect(configArg.isAutoStagger).toBe(true);
  expect(configArg.delay).toBe(0);
});
```

Check `createTestInstance`'s existing signature for how `context.mountInstance`
is normally stubbed before writing this — adapt to match rather than
introducing a second, inconsistent mocking pattern in the same file.

Report actual grep output, not a summary. Do not report this complete based
on "tests pass" alone.
