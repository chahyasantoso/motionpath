# MotionPath architecture and folder map

## Target boundary

```text
packages/
  core/src/
    domain/       plugin contracts and built-ins
    engines/      Engine lifecycle and dependency injection
    errors/       public runtime errors
    lib/          Track, Motion, schema parsing, event bus
    usecases/     compilation and normalization
    validators/   executable schema rules
    adapters/     GSAP, DOM, browser and headless platform seams
    types/        canonical public declarations
    contract/     versioned contract constants and fixtures
  react/src/
    hooks/        React-only bindings
apps/
  demo/src/
    components/   visual demos and scenes
    App.jsx
    main.jsx
```

## Extraction status

Slice 1 is now physical: canonical contract constants, runtime/public types, the GSAP platform adapter, and the DOM renderer live under `packages/core/src`. The legacy runtime remains intentionally intact while each next slice updates imports and removes its source path, keeping every PR buildable.

| Current path | Target path | Rule |
| --- | --- | --- |
| `src/domain`, `src/engines`, `src/errors`, `src/lib`, `src/usecases`, `src/validators` | `packages/core/src/<same>` | core stays React/DOM-free |
| `src/adapters/gsapPlatform.js`, `src/renderers/domRenderer.js` | `packages/core/src/adapters/` | platform-boundary code lives together |
| `src/contract`, `src/types` | `packages/core/src/contract`, `packages/core/src/types` | contract and declarations are core-owned |
| `src/hooks` | `packages/react/src/hooks` | only React package imports React |
| `src/components`, `src/App.jsx`, `src/main.jsx`, `src/App.css` | `apps/demo/src/` | demo-only UI and routes |
| `src/utils/pathUtils.js`, `src/utils/projection3d.js`, `src/lib/fkMath.js` | `packages/core/src/math/` | generic and FK math share one home; names stay explicit |

## Import direction

`apps/demo -> @motionpath/react -> @motionpath/core`. Core must never import React, JSX, router, demo components, or DOM globals. `domRenderer` is an adapter, not a domain service.

## Reorganization rules

- Keep co-located `__tests__` and `integration/fixtures` beside the implementation they verify.
- Fold `contract` into core; it is not a fourth runtime package.
- Do not create a parallel implementation in old and new paths. Move a file, update all imports, then delete the old path in the same PR.
- Keep `packages/*` and `apps/*` in root workspaces only when the lockfile is updated in the same change.
- The architecture boundary test scans both legacy and extracted roots during the migration, then becomes package-only after the final move.
