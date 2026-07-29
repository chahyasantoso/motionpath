# MotionPath v4.1 release readiness

## What changed

v4.1 hardens the v4 runtime without changing its data-first animation model:

- shared runtime dependency injection across parse, compile, and mount
- failure-atomic project reloads
- canonical contract constants and executable fixtures
- immutable compile-time project normalization
- idempotent lifecycle ownership and partial-mount cleanup
- strict plugin metadata validation
- observation graph cycle validation
- renderer cache and subscriber cleanup
- explicit GSAP and ScrollTrigger platform registration
- typed runtime boundary contracts
- package boundary bootstrap for core, React integration, and demo app
- performance budgets and verification scenarios

## Migration notes

- Prefer per-Engine plugin and trigger registries. Global registration remains a compatibility path.
- A failed `loadProject()` no longer destroys a working project.
- `Engine.unmount()` ignores foreign objects instead of calling their `destroy()` method.
- Authoring templates are normalized into immutable runtime configs during parsing.
- ScrollTrigger registration is explicit at scroll delegate build time.
- Runtime package consumers should target `@motionpath/core`; React bindings belong in `@motionpath/react`.
- Observation cycles now fail validation before mounting.

## Upgrade checklist

1. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run pack:check`.
2. Replace global plugin mutation with an Engine-local registry where possible.
3. Ensure custom trigger delegates expose the full delegate lifecycle.
4. Remove any code that relies on foreign-object destruction through `engine.unmount()`.
5. Run the FK scroll-scrub demo and verify teardown after route changes.

## Release gate

The v4.1 release candidate requires both Node 20 and Node 22 CI jobs to complete successfully, plus browser smoke coverage for time, manual, scroll, and FK observation graphs.
