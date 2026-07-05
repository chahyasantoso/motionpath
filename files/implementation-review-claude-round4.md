# MotionPath — Fix Plan (Round 4)

**Status:** Supersedes Round 3 Task 1 entirely. That task is not "done" — the sniffing pattern was moved, not removed. This document is the complete, final fix. Standalone — implement against this only.

**What happened, stated plainly:** Round 3 asked for a uniform `(element, scenario, context, path)` signature with no runtime branching. The actual result — `const actualPath = (typeof context === 'string') ? context : path;` in three files — still branches on argument shape at runtime to keep the old 3-arg calling convention working. This is the same anti-pattern as the original bug, relocated from `ease-collision.js`/`stagger-shape.js`/`trigger-shape.js` to `direction-ambiguity.js`/`path-xy-exclusivity.js`/`path-shape.js`. The arity regression test added in Round 3 did not catch it, because `function.length` reflects declared parameters, not what the function body does with them at runtime — a function can declare 4 parameters and still silently reinterpret them by type. That gap is fixed here too.

**Do not "support both calling conventions."** There is no compatibility requirement here — nothing external depends on these internal function signatures. Every call site, everywhere, uses the same shape. If a test currently calls the old shape, the test is wrong and gets updated. The function is never made to tolerate it.

---

## Task 1 — Remove the sniff from all three files, no exceptions

**Files:** `validators/rules/direction-ambiguity.js`, `validators/rules/path-xy-exclusivity.js`, `validators/rules/path-shape.js`.

**Remove this line entirely from all three:**
```js
const actualPath = (typeof context === 'string') ? context : path;
```

**Use `path` directly everywhere `actualPath` was used.** `context` is accepted as the 3rd parameter (declared, matching the uniform signature) and is simply unused in these three rules' bodies — that's correct and fine, exactly like `timeline-group.js` and `element-uniqueness.js` already do it correctly today with their unused `context` parameter. Do not read `context` in these three files. Do not add any conditional based on its type, presence, or shape.

---

## Task 2 — Fix the three rules' own test files to call the real signature

**Files:** `validators/rules/__tests__/direction-ambiguity.test.js`, `path-xy-exclusivity.test.js`, `path-shape.test.js`.

Every call currently looks like:
```js
const errors = directionAmbiguityRule(element, {}, 'scenarios[0].elements[0]');
```

Change every one of these calls, in all three files, to the real 4-argument signature:
```js
const errors = directionAmbiguityRule(element, {}, { schema: {} }, 'scenarios[0].elements[0]');
```
(`{ schema: {} }` is a placeholder context object — its contents don't matter for these three rules since none of them read it. What matters is that it occupies the 3rd position correctly, so `path` lands in the 4th.)

Do this for every call site in all three files — a grep for the rule's name in each test file should show zero remaining 3-argument calls once done.

---

## Task 3 — Strengthen the arity test so this specific regression can't slip through silently again

**File:** `validators/__tests__/index.test.js`.

The existing arity test (`rule.length` check) stays — it's still useful for catching a totally wrong parameter count. But it does not catch a function that declares the right number of parameters and then branches on their runtime type/shape internally. Add this alongside it:

```js
it('element rules use the 3rd argument positionally as context, never sniffing its type', () => {
  const element = { keyframes: { opacity: { stops: [{ p: 0.5 }] } } }; // triggers direction-ambiguity's error path
  const scenario = {};
  const realPath = 'scenarios[0].elements[0]';

  // Pass a string in the context position — a correct implementation ignores it
  // as an unused parameter. A sniffing implementation would misinterpret it as
  // a legacy 3-arg call and shift `path` into the wrong slot, corrupting the
  // error's `path` field.
  const errors = directionAmbiguityRule(element, scenario, 'not-a-context-object', realPath);

  expect(errors.length).toBeGreaterThan(0);
  errors.forEach(e => expect(e.path.startsWith(realPath)).toBe(true));
});
```

Repeat the same pattern for `pathXYExclusivityRule` and `pathShapeRule`, each with a minimal element fixture that triggers at least one error from that specific rule (reuse fixtures already in the codebase's own rule test files if convenient — no need to invent new ones from scratch).

This test is the actual safety net going forward — it exercises behavior, not just declared shape, which is what the Round 3 arity test was missing.

---

## Verification checklist (self-check before calling this done)

- `grep -rn "typeof context" validators/rules/` returns **zero results**, anywhere, in any file.
- `grep -rn "actualPath" validators/rules/` returns **zero results**.
- Every call to `directionAmbiguityRule`, `pathXYExclusivityRule`, `pathShapeRule` in the entire codebase (rule files, test files, orchestrator) passes exactly 4 positional arguments in the order `(element, scenario, context, path)`.
- The new behavioral test in Task 3 exists for all three rules and passes.

If any of these four checks fails, the fix is incomplete — do not report this task as done until all four pass.
