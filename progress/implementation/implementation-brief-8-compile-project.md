# MotionPath — Implementation Brief 8: Extract Shared `compileProject`

## Context

`ProductionEngine.loadProject()` and `EditorEngine.loadProject()` each
independently run the identical sequence — `validateProject(schema)` →
`buildProject(schema, deps)` → `createEngineCore(buildResult)` — before
diverging at their final step (real `ScrollTrigger`/`.play()` wiring for
Production; `setProgress()`/`.seek()`-only for Editor). This is copy-pasted
orchestration, not shared code — if the compile sequence ever needs to
change, both files have to be edited in lockstep, which is exactly the kind
of drift risk this project has already paid for once (the legacy
`motionEngine.js` mash-up).

This brief extracts that shared preamble into its own function. It does not
change `validateProject`, `buildProject`, or `createEngineCore` themselves —
none of their internals or existing tests need to change.

## Non-goals (explicit)

- **Do not rename this `MotionEngine`.** That name belongs to the fully
  retired legacy file (`motionEngine.js`) — a 709-line duplicated-logic
  god-object that this whole redesign replaced. Reusing the name is a real
  footgun for anyone grepping history or docs later. Use `compileProject` /
  `ProjectCompiler` / similar — anything that doesn't collide.
- **Do not put this logic inside `engineCore.js`.** `createEngineCore` is
  synchronous and takes an already-built `buildResult` (its own doc comment:
  "never writes to DOM, never calls ScrollTrigger, never calls `.play()`").
  `buildProject()` is async. Folding compile in would force
  `createEngineCore` to become async and would break its existing
  build-result-only test suite (tests would then need full schema
  validation to pass instead of a hand-built fixture). Keep them separate
  files with separate responsibilities.
- **Do not touch the `triggerType` wiring dispatch inside
  `ProductionEngine`.** That's a different, already-correct piece (a single
  project mixes scroll-scrub/scroll-observer/time scenarios simultaneously,
  not as swappable modes) and is out of scope for this brief.
- **Do not change the stale-load-guard (`_loadGeneration`) logic.** It stays
  exactly where it is in each engine, wrapping the call to
  `compileProject()` the same way it currently wraps the inline
  validate/build/core sequence.

## 1. New file: `src/lib/compileProject.js`

```js
import { validateProject } from "../validators/index.js";
import { buildProject } from "./builder.js";
import { createEngineCore } from "./engineCore.js";

/**
 * Shared compile preamble used by both ProductionEngine and EditorEngine:
 * validate -> build -> wrap in EngineCore. Pure aside from allocating GSAP
 * timeline/proxy objects — never touches ScrollTrigger, never calls
 * .play(), never touches the DOM. Throws on hard validation errors, same
 * as the previous inline sequence in each engine.
 *
 * @param {object} schema
 * @param {object} deps - forwarded to buildProject (e.g. resolveElement,
 *   or whatever the current buildProject dependency shape is)
 * @returns {Promise<{ core: EngineCore, buildResult: BuildResult }>}
 */
export async function compileProject(schema, deps) {
  const errors = validateProject(schema) || [];
  const hardErrors = errors.filter((e) => e.severity !== "warning");
  if (hardErrors.length > 0) {
    const err = new Error(
      `MotionPath: schema validation failed with ${hardErrors.length} error(s).`,
    );
    err.validationErrors = errors;
    throw err;
  }

  const buildResult = await buildProject(schema, deps);
  const core = createEngineCore(buildResult);

  return { core, buildResult };
}
```

Match the exact error-shape/severity-filtering logic already present in
`ProductionEngine.js` and `EditorEngine.js` today — check both current
implementations before writing this, since one may have a detail
(warning-vs-error filtering, error object shape) the other doesn't, and this
extraction should not silently change behavior for either caller. If they
differ, surface that as a question rather than guessing which one is
"correct" — resolve it explicitly, don't just pick one.

## 2. `ProductionEngine.js` changes

Replace the inline `validateProject` → `buildProject` → `createEngineCore`
sequence inside `loadProject()` with a single call:

```js
const { core, buildResult } = await compileProject(schema, deps);
```

Everything after that (the stale-load generation check, storing `_core` /
`_buildResult`, and the wiring step — `ScrollTrigger.create()`,
`.play()` for time groups, etc.) stays exactly as-is, just reading from
`core`/`buildResult` instead of local variables assembled inline.

## 3. `EditorEngine.js` changes

Same substitution. `EditorEngine`'s `loadProject()` shrinks correspondingly
— it should now be close to just: call `compileProject`, store the result,
done (no wiring step to speak of, per its existing design).

## Verification checklist

1. Grep both `ProductionEngine.js` and `EditorEngine.js` for
   `validateProject` and `buildProject` — both imports and calls should be
   gone from these two files; only `compileProject.js` imports them now.
2. Grep the whole repo for `MotionEngine` (case-sensitive) — zero results,
   confirming the naming footgun was avoided.
3. `engineCore.js` itself is untouched — diff it against the pre-brief
   version and confirm zero changes.
4. Full existing test suite (189 tests as of last count) still passes with
   no modifications to existing test files for `builder.js`,
   `engineCore.js`, or `validators/`.
5. New test file `compileProject.test.js`: valid schema → returns
   `{core, buildResult}`; invalid schema → throws with the validation
   errors attached; confirm a stale/superseded load (generation counter
   incremented mid-await in the calling engine, not inside
   `compileProject` itself) is still handled correctly by each engine's
   existing guard, since `compileProject` itself has no opinion about
   staleness.
6. Behavioral test on both engines: load the same schema through each and
   confirm `buildResult` shape is identical regardless of which engine
   compiled it (this is the actual point of the extraction — guaranteed
   parity between Production and Editor compilation, not just less
   duplicated code).
