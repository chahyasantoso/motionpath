# Brief: Fix `MotionProject` motion-key collapse, retire now-dead fallback lookups, scope `_triggerRefs`

**Branch:** `v3`, from `a1a34f3`. Three related fixes — do them in this order, since #2 and #3 depend on #1 being correct first.

---

## Fix 1 (root cause) — `MotionProject` silently drops motions without `motionId`

`src/domain/models.js`, `MotionProject` constructor.

**Bug:** keying the Map by raw `motionId` means every motion that omits it collapses onto the single key `undefined` — only the last such motion survives, earlier ones are silently discarded. Confirmed via repro: 3 motions (2 unnamed + 1 named) in → `Map size: 2`, `getMotion('0')` → `undefined`, `getMotionsList()` order shifted. No schema validator catches this; the 214-test suite doesn't either, because every existing test schema happens to name all its motions.

**WRONG (current):**

```js
constructor({ schemaVersion, perspective = null, templates = [], motions = [] }) {
  this.schemaVersion = schemaVersion;
  this.perspective = perspective;
  this.templates = new Map(templates.map(t => [t.templateId, t]));
  this.motions = new Map(motions.map(m => [m.motionId, m]));
}
```

**CORRECT:**

```js
constructor({ schemaVersion, perspective = null, templates = [], motions = [] }) {
  this.schemaVersion = schemaVersion;
  this.perspective = perspective;
  this.templates = new Map(templates.map(t => [t.templateId, t]));
  // Motions without motionId fall back to their positional index as the
  // key, matching the schema's own documented convention for unnamed
  // motions. Do NOT key by raw m.motionId alone — every unnamed motion
  // would collapse onto the single key `undefined`.
  this.motions = new Map(motions.map((m, i) => [m.motionId ?? String(i), m]));
}
```

`getMotion(motionId)` and `getMotionsList()` need no changes — they become fully correct once the Map itself is keyed right.

---

## Fix 2 — Delete the now-redundant fallback lookups

Once Fix 1 lands, `getMotion(motionId)` is reliable for both named and positional lookups on its own. The manual "search `getMotionsList()` again if `getMotion()` returned nothing" blocks in 4 places become dead defensive code masking the real bug (and were themselves operating on the corrupted list before, which is why they still didn't work). Delete them.

Files: `src/engines/ProductionEngine.js` (`mountInstance`, `mountTimeline`), `src/engines/EditorEngine.js` (`mountTimeline`), `src/engines/resolveMotion.js` (`resolve`).

**WRONG (pattern repeated in all 4 places, e.g. `ProductionEngine.mountInstance`):**

```js
let schemaMotion = _project.getMotion(motionId);
if (!schemaMotion) {
  const motionsList = _project.getMotionsList();
  schemaMotion = motionsList.find(
    (m, idx) => m.motionId === motionId || String(idx) === motionId,
  );
}
if (!schemaMotion) {
  throw new Error(`mountInstance: motion with id "${motionId}" not found.`);
}
```

**CORRECT:**

```js
const schemaMotion = _project.getMotion(motionId);
if (!schemaMotion) {
  throw new Error(`mountInstance: motion with id "${motionId}" not found.`);
}
```

Apply the equivalent simplification in `mountTimeline` (both engines, same pattern, keep each one's own error message text) and in `resolveMotion.js`.

`resolveMotion.js`'s `resolve()` additionally has an `isDomain` branch that still supports being called with a raw schema object (non-domain) as well as a `MotionProject`. Keep that dual-mode support — do not force every caller onto `MotionProject` as part of this brief — but simplify only the domain-object branch the same way:

**WRONG:**

```js
const isDomain = schema && typeof schema.getMotion === "function";
let originalMotion = isDomain
  ? schema.getMotion(motionId)
  : schema.motions?.find(
      (m) =>
        m &&
        (m.motionId === motionId ||
          (m.motionId === undefined &&
            String(schema.motions.indexOf(m)) === motionId)),
    );

if (!originalMotion && isDomain) {
  const motionsList = schema.getMotionsList();
  originalMotion = motionsList.find(
    (m, idx) => m.motionId === motionId || String(idx) === motionId,
  );
}
```

**CORRECT:**

```js
const isDomain = schema && typeof schema.getMotion === "function";
const originalMotion = isDomain
  ? schema.getMotion(motionId)
  : schema.motions?.find(
      (m) =>
        m &&
        (m.motionId === motionId ||
          (m.motionId === undefined &&
            String(schema.motions.indexOf(m)) === motionId)),
    );
```

---

## Fix 3 — Scope `_triggerRefs` to the factory instance

Carried over unapplied from the last brief. `src/engines/ProductionEngine.js`:

**WRONG (current):**

```js
export function createProductionEngine(deps) {
  // ...
  return {
    // ...
    registerTriggerRef(id, ref) {
      _triggerRefs.set(id, ref);
    },
    unregisterTriggerRef(id) {
      _triggerRefs.delete(id);
    },
  };
}

const _triggerRefs = new Map(); // module-level, shared by every instance

export const productionEngine = createProductionEngine({
  resolveElement: (id) => {
    const ref = _triggerRefs.get(id);
    if (!ref || !ref.current) {
      throw new Error(/* ... */);
    }
    return ref.current;
  },
});
```

**CORRECT:**

```js
export function createProductionEngine(deps = {}) {
  const _triggerRefs = new Map(); // id -> React.RefObject, scoped to this engine instance

  const resolveElement =
    deps.resolveElement ??
    ((id) => {
      const ref = _triggerRefs.get(id);
      if (!ref || !ref.current) {
        throw new Error(
          `MotionPath: trigger ref '${id}' is not registered. ` +
            `Ensure useMotionTrigger('${id}', ref) is mounted (and its ref attached) ` +
            `before this project's scenarios are wired.`,
        );
      }
      return ref.current;
    });

  const _deps = { ...deps, resolveElement };
  // ... every other use of `deps` in this file (inside mountInstance's
  // instanceDeps = { ...deps, mountInstance: ... }) switches to `_deps`.

  return {
    // ...
    registerTriggerRef(id, ref) {
      _triggerRefs.set(id, ref);
    },
    unregisterTriggerRef(id) {
      _triggerRefs.delete(id);
    },
  };
}

export const productionEngine = createProductionEngine();
export default productionEngine;
```

---

## Non-goals

- Not touching `CompileProject.js`'s internal use of `_project`/`buildResult` beyond what Fix 2 requires in `EditorEngine.mountTimeline`.
- Not forcing `resolveMotion.resolve()` to drop its raw-schema (`isDomain === false`) code path.
- Not renaming or implementing `mountTimeline` beyond the lookup simplification — it stays validate-only, as previously scoped.

## Verification checklist (fresh clone, grep + a real test run)

1. `grep -n "this.motions = new Map" src/domain/models.js` shows the `m.motionId ?? String(i)` form.
2. New test in `src/domain/__tests__` (or wherever `models.js`/`ParseProjectSchema.js` is tested): a schema with 2+ motions that omit `motionId`, asserting (a) `project.motions.size` equals the schema's motion count, (b) `getMotion('0')` and `getMotion('1')` return the correct distinct motions, (c) `getMotionsList()` preserves original order. This is the regression test for the exact bug found — it must fail on the pre-fix code and pass after.
3. `grep -rn "motionsList.find" src` returns zero hits — confirms all 4 dead fallback blocks were removed, not just the model fixed.
4. `grep -n "_triggerRefs" src/engines/ProductionEngine.js` shows it declared only inside the factory function.
5. The isolation test from the previous brief (two `createProductionEngine()` instances, ref registered on one, other still throws "not registered") is present and passing.
6. Full suite green, count ≥ 215 (214 existing + at least the new model regression test).
