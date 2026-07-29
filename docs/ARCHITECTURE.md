# MotionPath architecture and folder map

## Target boundary

```text
packages/core/src/       runtime, validators, plugins, adapters, types, contract
packages/react/src/      React hooks and subscriber bindings
apps/demo/src/           routes, scenes, visual components, CSS, fixtures
```

## Current status

The package boundaries are established and merged through PR #47. The remaining work is a mechanical physical relocation of the legacy implementation: `src/components` to `apps/demo/src/components`, `src/hooks` to `packages/react/src/hooks`, and root app files to `apps/demo/src`.

The extracted package roots now have boundary tests, and no new runtime code should land in legacy `src/*`. Keep co-located tests and `integration/fixtures` with the implementation they verify.

Import direction: `apps/demo -> @motionpath/react -> @motionpath/core`. Core must not import React, JSX, router, demo components, or DOM globals.
