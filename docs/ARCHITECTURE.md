# MotionPath architecture and folder map

## Target boundary

```text
packages/
  core/src/
    domain/ engines/ errors/ lib/ usecases/ validators/ adapters/ types/ contract/
  react/src/hooks/
apps/demo/src/
```

## Consolidated extraction status

The package boundary is now wired end-to-end in one compatibility slice:

- `packages/core/src/domain`, `usecases`, `contract`, `types`, `adapters` are extracted sources.
- `packages/core/src/engines`, `lib`, `validators`, and `errors` expose the remaining runtime through explicit boundary files.
- `packages/react/src/hooks` exposes the React integration surface.
- `apps/demo` remains the visual application boundary.

The runtime bridge files are intentional migration seams. The next cleanup can move their implementations without changing consumer imports.

Import direction: `apps/demo -> @motionpath/react -> @motionpath/core`. Core must not import React, JSX, router, or demo components.

Keep co-located tests and `integration/fixtures` with the implementation they verify. Do not create a second implementation while replacing a bridge.
