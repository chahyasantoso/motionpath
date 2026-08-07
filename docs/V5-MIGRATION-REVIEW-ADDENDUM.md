# v5 migration review addendum

**Date:** 2026-08-07  
**Applies to:** `docs/V5-ARCHITECTURE-REFACTOR-PLAN.md`  
**Status:** decisions accepted for implementation

This addendum resolves three concerns identified during review of the current plan.

## 1. Phase 3 shadow validation scope

Phase 3 must not claim production-demo validation while `createGroupHost()` remains the live composite. The publisher migration has two explicit validation levels:

### Phase 3A: synthetic and contract validation

Before the composite migration, `MotionRuntime` validates the publisher path against deterministic fixtures that cover:

- same-motion input and output edges;
- fan-in, fan-out, and multi-level dependency chains;
- edge replacement, source invalidation, retry, and failure isolation;
- equivalent old/new patch output;
- paused, seeking, reversed, and independently progressed sources;
- mount, unmount, reload, and failed-transaction rollback.

The exit gate is explicitly **fixture-only validation**. It proves graph and publisher semantics, not demo integration.

### Phase 3B: compatibility-composite shadow validation

During the migration window, `createGroupHost()` is treated as a supported composite runtime, not as a special exception. Introduce a temporary `CompositeRuntime` adapter around the existing `TrackGroup`/group-host path. It exposes the same runtime surface as `MotionRuntime`:

```js
{
  register,
  unregister,
  replaceEdges,
  flush,
  dispose,
}
```

The adapter owns no new graph semantics. It only lets the existing group-host demo participate in the same shadow-mode publisher comparison. The old recursive composer remains the rendering authority until comparison passes.

The live Spiral demo exit gate is therefore:

- Phase 3A passes fixture and contract tests;
- Phase 3B runs shadow mode against the actual `createGroupHost()` path;
- old/new patches match within a defined numeric tolerance for spawn, pop, reflow, seek, reverse, and destroy;
- no retained publisher, binding, track, or scheduler objects remain after churn.

Only then does Phase 4 replace `createGroupHost()` with manual-trigger `Motion`.

### Temporary boundary rule

`CompositeRuntime` is migration-only. It must be deleted after Phase 4, not promoted into a fourth permanent composite abstraction. Add a removal issue and a test that fails if the adapter remains after the Phase 4 cleanup gate.

## 2. `createGroupHost()` to manual Motion compatibility

Phase 4 must preserve current group-host behavior, including autoplay.

Replace:

```js
engine.createGroupHost({ id, staggerTransition, autoplay })
```

with:

```js
engine.createMotion({
  id,
  trigger: { type: "manual", autoplay },
  staggerTransition,
})
```

The manual trigger contract must explicitly accept `autoplay: boolean`, defaulting to the current `createGroupHost()` behavior (`true`). The delegate must build its scheduler paused when `autoplay === false`, and start it when `autoplay === true`.

Add characterization tests before changing the implementation:

- `autoplay: true` starts immediately;
- `autoplay: false` remains paused until `play()`;
- `seek(0)` and `seek(1)` match the old host;
- `pause()`, `reverse()`, `removeChild()`, reflow, and `destroy()` preserve existing behavior;
- repeated initialization does not reuse a destroyed delegate or empty the Motion.

Do not hide autoplay in `Motion`; it belongs to the trigger configuration and must be represented in the public contract.

## 3. FK plugin and observation cross-check

Add an explicit normalization/validation rule before Phase 7 moves observation state out of `Track`.

The FK plugin declares `inputs: ["parentWorld"]`, while its runtime fallback currently defaults when `parentWorld` is absent. That fallback is useful for standalone tracks, but it must not conceal a malformed authored rig.

Define two modes:

- **Authored graph mode:** every plugin-declared required input must have exactly one compatible observation edge, unless the plugin declares that the input is optional and provides a documented default.
- **Standalone mode:** local composition may use plugin defaults when no graph runtime is attached.

For `fkPlugin`, choose one explicit contract. Recommended: `parentWorld` is required in authored graph mode, and the plugin metadata declares its standalone default separately:

```js
{
  inputs: {
    parentWorld: {
      requiredInGraph: true,
      standaloneDefault: { x: 0, y: 0, rotation: 0 },
    },
  },
}
```

The validator/normalizer must cross-check:

1. plugin-declared inputs against authored `observes` edges;
2. edge target names against declared plugin inputs;
3. duplicate edges targeting one input;
4. input/output role compatibility;
5. required inputs with no matching edge;
6. edges targeting unknown or unsupported plugin inputs.

Diagnostics must be stable and actionable, for example:

- `GRAPH_INPUT_MISSING`
- `GRAPH_INPUT_UNKNOWN`
- `GRAPH_INPUT_DUPLICATE`
- `GRAPH_INPUT_ROLE_MISMATCH`

Do not infer this from plugin names or silently accept a missing FK edge. Add fixtures for valid FK chains, missing `parentWorld`, wrong target names, duplicate parent edges, standalone fallback, and cross-motion qualified sources.

## Revised sequencing gates

The affected plan phases now have these gates:

- **Phase 3:** publisher correctness proven with fixtures, then shadow-tested through temporary `CompositeRuntime` against the real group-host demo.
- **Phase 4:** replace group-host with manual-trigger Motion, including explicit autoplay compatibility tests; delete `CompositeRuntime` after migration.
- **Phase 7:** move observation ownership only after plugin-input/observation validation is enforced and standalone defaults are explicitly separated from authored graph requirements.
- **Phase 8:** enable cross-motion and free-track capabilities only after the above gates pass.

This keeps the architecture honest: Phase 3 proves the publisher, Phase 3B proves the current demo integration, Phase 4 changes the composite, and Phase 7 closes the schema/runtime contract gap.