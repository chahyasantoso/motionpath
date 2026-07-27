# MotionPath v3 Fix Plan for Lower-Capability Model

This document describes the exact fixes to apply to `chahyasantoso/motionpath` branch `v3`. It is written for a lower-capability coding model, so the instructions are explicit, narrow, and implementation-focused. The project is a React + GSAP animation framework with layered folders for `domain`, `usecases`, `engines`, `hooks`, and `validators`.[cite:4][cite:10]

## Goal

Apply small, safe fixes that improve maintainability, predictability, and error visibility without redesigning the architecture. The current codebase already has a good separation between pure domain logic, engine orchestration, hooks, and validators, so the task is to remove sharp edges rather than rebuild the system.[cite:4][cite:7][cite:11]

## Scope

Make changes only in these areas:

- `src/hooks/useMotionInstance.js` for stale `config` handling.[cite:15]
- `src/engines/BaseEngine.js` for destroy lifecycle handling.[cite:11]
- `src/engines/TimelineGroupController.js` for driver type normalization.[cite:17]
- `src/domain/plugins.js` for unimplemented lazy plugin behavior.[cite:14]
- `src/engines/resolveMotion.js` for single input format cleanup.[cite:12]
- Add or update tests under existing `__tests__` folders where relevant.[cite:6][cite:8][cite:10][cite:13][cite:16]

Do not rename public APIs unless clearly required. Do not migrate to TypeScript in this task. Do not change schema structure. These fixes should stay incremental and low risk.[cite:7][cite:11]

## Fix 1: Clarify `useMotionInstance` config semantics

### Problem

`useMotionInstance` mounts an instance using `motionId` and `config`, but the effect dependency array only includes `motionId`. This means a changed `config` value is ignored after mount, which creates stale behavior and hides it behind an eslint disable comment.[cite:15]

### Decision

Treat `config` as mount-time-only for now. This is the smallest safe fix because runtime reconfiguration could have side effects inside the engine lifecycle. `useMotionProject` already uses the same “load once, later changes ignored” pattern for `initialPlayStates`, so this choice is consistent with the current design.[cite:9][cite:15]

### Required change

Update `src/hooks/useMotionInstance.js`:

1. Store the first `config` in a ref.
2. Use that ref when calling `productionEngine.mountInstance`.
3. In development, warn if `config` changes after mount.
4. Add a doc comment that `config` is mount-time-only.

### Target behavior

- First render uses the provided `config`.
- Later `config` changes do not remount automatically.
- A developer gets a warning in development when passing a changing config object.[cite:15]

### Suggested implementation

```js
import { useEffect, useRef, useState } from "react";
import { productionEngine } from "../engines/ProductionEngine.js";

export default function useMotionInstance(motionId, config) {
  const [instance, setInstance] = useState(null);
  const initialConfigRef = useRef(config);
  const warnedConfigChangeRef = useRef(false);

  if (
    import.meta.env?.DEV &&
    !warnedConfigChangeRef.current &&
    initialConfigRef.current !== config
  ) {
    warnedConfigChangeRef.current = true;
    console.warn(
      "[useMotionInstance] config is mount-time-only. Changing config after mount has no effect.",
    );
  }

  useEffect(() => {
    if (!motionId) return undefined;

    const inst = productionEngine.mountInstance(
      motionId,
      initialConfigRef.current,
    );

    const triggers = {};
    inst.requiredTriggerIds.forEach((id) => {
      let activeRef = null;
      triggers[id] = (el) => {
        if (el) {
          activeRef = { current: el };
          productionEngine.registerTriggerRef(id, activeRef);
        } else if (activeRef) {
          productionEngine.unregisterTriggerRef(id, activeRef);
          activeRef = null;
        }
      };
    });
    inst.triggers = triggers;

    setInstance(inst);

    return () => {
      inst.destroy();
      setInstance(null);
    };
  }, [motionId]);

  return instance;
}
```

### Tests to add

- Hook test: changing `config` after mount does not call `mountInstance` again.[cite:8][cite:15]
- Hook test: development warning is emitted once when `config` identity changes after mount.[cite:15]

## Fix 2: Remove destroy monkey-patching from `BaseEngine`

### Problem

`BaseEngine.mountInstance` overrides `instance.destroy` after instance creation. This is fragile because it mutates behavior from the outside and assumes the instance is mutable forever.[cite:11]

### Decision

Push engine cleanup integration into instance creation rather than patching methods later. Keep the external `instance.destroy()` API the same, but compose cleanup inside the factory path.[cite:11][cite:16]

### Required change

1. Update `createMotionInstance` in `src/usecases/CreateMotionInstance.js` so it accepts an optional `onDestroy` callback in its dependencies or options.
2. Ensure the returned instance’s own `destroy()` runs its internal cleanup and then calls `onDestroy()` once.
3. Remove the destroy reassignment logic from `BaseEngine.mountInstance`.[cite:11][cite:16]

### Target behavior

- `BaseEngine` still removes the instance from `_instances` and timeline groups.
- `instance.destroy()` still works for all callers.
- No runtime method reassignment happens inside `BaseEngine`.[cite:11]

### Implementation outline

In `BaseEngine.mountInstance`, replace the monkey-patched block with a callback passed into `createMotionInstance`:

```js
const instance = createMotionInstance(motionId, effectiveConfig, {
  project: this._project,
  resolveElement: this.#resolveElement,
  mountInstance: (childMotionId, childConfig) =>
    this.mountInstance(childMotionId, childConfig),
  onSubscriberChange,
  onDestroy: (destroyedInstance) => {
    this._instances.delete(destroyedInstance.id);

    if (destroyedInstance._timelineGroupId) {
      const controller = this._groups.get(destroyedInstance._timelineGroupId);
      if (controller) {
        const isEmpty = controller.removeMember(
          destroyedInstance.id,
          destroyedInstance.motionId,
        );
        if (isEmpty) {
          controller.destroy();
          this._groups.delete(destroyedInstance._timelineGroupId);
        }
      }
    }
  },
});
```

Then in `createMotionInstance`, wrap the original cleanup in a locally owned `destroy()` implementation that guarantees idempotency.

### Tests to add

- Engine test: destroying an instance removes it from `_instances`.[cite:10][cite:11]
- Engine test: destroying the last grouped instance destroys the group controller.[cite:11][cite:17]
- Engine test: calling `destroy()` twice does not throw and does not duplicate cleanup.[cite:11]

## Fix 3: Normalize supported driver types

### Problem

`TimelineGroupController` accepts `timeline`, `scroll`, `gsap-timeline`, and `gsap-scroll`, while the domain helpers focus on `timeline` and scroll trigger structure. This creates ambiguity and possible legacy drift.[cite:7][cite:17]

### Decision

Support only canonical runtime driver types in controller code: `timeline` for timeline playback and timeline-plus-scroll-trigger configuration through `driver.trigger.type === 'scroll'`. Remove legacy string branches unless tests or schema docs prove they are still required.[cite:7][cite:17]

### Required change

Refactor `attachDriver` in `src/engines/TimelineGroupController.js`:

1. Read `schemaMotion.driver.type`.
2. If `driver.type === 'timeline'` and `driver.trigger?.type === 'scroll'`, attach `ScrollTrigger`.
3. If `driver.type === 'timeline'` and no scroll trigger exists, use regular timeline autoplay behavior.
4. Remove checks for `'gsap-timeline'`, `'gsap-scroll'`, and top-level `'scroll'` as driver types unless validator and schema docs explicitly require them.[cite:7][cite:17]

### Safer branch shape

```js
const driver = schemaMotion.driver || {};
const trigger = driver.trigger || {};

if (driver.type !== "timeline") {
  return;
}

if (trigger.type === "scroll") {
  // scroll trigger mode
} else {
  // regular timeline mode
}
```

### Tests to add

- Timeline driver without scroll trigger auto-plays according to config.[cite:17]
- Timeline driver with `trigger.type === 'scroll'` creates `ScrollTrigger`.[cite:7][cite:17]
- Unsupported driver type does not attach a driver and should fail earlier through validation if appropriate.[cite:13][cite:17]

## Fix 4: Make unimplemented lazy plugins fail loudly

### Problem

Several lazy plugins in `src/domain/plugins.js` claim keys like `splitText`, `morphSVG`, `drawSVG`, and `scrambleText`, but `load()` resolves immediately and `contribute()` does nothing. This produces silent no-op behavior.[cite:14]

### Decision

Do not silently succeed for unimplemented features. Fail loudly with a clear error message. This is safer for debugging and avoids shipping broken animations that appear valid.[cite:14]

### Required change

Replace the no-op lazy plugin stubs with a helper factory for unsupported plugins:

```js
function createUnsupportedLazyPlugin(featureName, key) {
  return {
    keys: [key],
    lazy: true,
    claimsKey(k) {
      return k === key;
    },
    load() {
      return Promise.reject(
        new Error(
          `[MotionPath] Plugin '${featureName}' for key '${key}' is not implemented.`,
        ),
      );
    },
    contribute() {
      throw new Error(
        `[MotionPath] Plugin '${featureName}' for key '${key}' is not implemented.`,
      );
    },
  };
}
```

Then define:

```js
export const splitTextPlugin = createUnsupportedLazyPlugin(
  "splitText",
  "splitText",
);
export const morphSvgPlugin = createUnsupportedLazyPlugin(
  "morphSVG",
  "morphSVG",
);
export const drawSvgPlugin = createUnsupportedLazyPlugin("drawSVG", "drawSVG");
export const scrambleTextPlugin = createUnsupportedLazyPlugin(
  "scrambleText",
  "scrambleText",
);
```

### Target behavior

- Any schema using those features fails fast during plugin load or track composition.[cite:11][cite:14]
- Error messages clearly identify the missing plugin.
- The failure is visible in development and tests.

### Tests to add

- `ensureLoaded(splitTextPlugin)` rejects with a helpful error.[cite:14]
- Resolving a track that needs an unsupported plugin throws, not silently no-ops.[cite:12][cite:14]

## Fix 5: Simplify `resolveMotion` to one input type

### Problem

`resolveMotion` accepts both raw schema arrays and parsed domain models backed by `Map`. That adds branching and weakens assumptions. `BaseEngine` already parses the schema before engine usage, so the dual path is unnecessary in the main runtime path.[cite:11][cite:12]

### Decision

Standardize `createMotionResolver().resolve()` to accept only the parsed domain model. This keeps resolver logic small and easier to test.[cite:7][cite:11][cite:12]

### Required change

Update `src/engines/resolveMotion.js`:

1. Remove `isDomain` detection.
2. Always read motions using `getMotion(schema, motionId)`.
3. Always read templates as `schema.templates` from the domain model.
4. Adjust error text to say the resolver expects a loaded project model if needed.[cite:7][cite:12]

### Example simplified code shape

```js
function resolve(project, motionId, progress, overrides = {}) {
  const originalMotion = getMotion(project, motionId);

  if (!originalMotion) {
    throw new Error(`resolveMotion: motion with id "${motionId}" not found.`);
  }

  const driverType = originalMotion.driver?.type;
  if (driverType !== "delegate" && driverType !== "manual") {
    throw new Error(
      `resolveMotion: motion with id "${motionId}" is not a delegate or manual motion.`,
    );
  }

  const templates = project.templates;
  const result = {};
  const tracks = originalMotion.tracks || [];

  // existing loop stays mostly the same
}
```

### Tests to add

- Resolver test: works with parsed domain model.[cite:7][cite:12]
- Resolver test: passing raw schema fails clearly, if a guard is added.[cite:12]
- Resolver test: cache clears correctly on `clearCache()`.[cite:12]

## Optional Fix 6: Add lightweight typedefs instead of TypeScript

### Problem

The codebase relies on JSDoc comments but not shared typedef exports, so plugin and model contracts are easy to misuse in editors.[cite:7][cite:14]

### Decision

Do not migrate to TypeScript in this task. Instead, add shared JSDoc typedefs for the highest-value contracts. This is lower risk and helps weaker tooling immediately.[cite:7][cite:14]

### Low-cost additions

Add typedefs for:

- `MotionProject`
- `MotionDefinition`
- `MotionTrack`
- `Plugin`
- `TimelineDriver`
- `ScrollTriggerConfig`[cite:7][cite:14]

Place them in a small shared file such as `src/domain/types.js` or at the top of the most central domain module. Only do this if it does not create noisy churn.

## Recommended implementation order

Apply changes in this order to reduce risk:

1. Fix plugin stubs to fail loudly.[cite:14]
2. Normalize `useMotionInstance` config semantics.[cite:15]
3. Remove destroy monkey-patching via `createMotionInstance` callback composition.[cite:11][cite:16]
4. Simplify `resolveMotion` input assumptions.[cite:12]
5. Normalize driver handling in `TimelineGroupController`.[cite:17]
6. Add optional typedef polish last.[cite:7]

This order starts with the most local changes and leaves behavior-coupled engine changes for later.[cite:11][cite:12][cite:17]

## Acceptance criteria

The task is complete when all conditions below are true:

- `useMotionInstance` clearly behaves as mount-time-only for `config`, with tests and documentation.[cite:15]
- `BaseEngine` no longer overwrites `instance.destroy` after creation.[cite:11]
- Unimplemented lazy plugins throw clear errors instead of silently doing nothing.[cite:14]
- `resolveMotion` only accepts one project shape in normal runtime use.[cite:12]
- `TimelineGroupController` uses one canonical driver interpretation aligned with the domain model.[cite:7][cite:17]
- Existing tests still pass, and new tests cover the new failure modes and lifecycle behavior.[cite:6][cite:8][cite:10][cite:13][cite:16]

## Guardrails for the coding model

Follow these rules during implementation:

- Prefer the smallest safe code change.
- Do not redesign the project architecture.
- Do not change public filenames unless necessary.
- Preserve current behavior unless the behavior is one of the listed problems.
- Add tests near the touched module instead of creating a new test structure.
- Fail loudly for unsupported features; do not hide errors with empty catches unless the surrounding code already intentionally ignores teardown cleanup.[cite:11][cite:12][cite:14]

## Commit plan

Use small commits in this order:

1. `fix: fail loudly for unsupported lazy plugins`
2. `fix: document mount-time-only useMotionInstance config`
3. `refactor: remove destroy monkey patch from BaseEngine`
4. `refactor: simplify resolveMotion to parsed project input`
5. `refactor: normalize timeline driver handling`
6. `test: cover lifecycle and unsupported plugin failures`

## Final note for the implementer

The repository already has a good architecture foundation: pure domain factories, explicit validation, and separated runtime engines. The job is to tighten ambiguous behavior, reduce hidden failure modes, and make the engine lifecycle easier to trust under maintenance.[cite:7][cite:11][cite:13]
