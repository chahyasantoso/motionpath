# MotionPath architecture and folder map

The target package layout is established. The last mechanical step is now reproducible with `npm run reorg:physical`.

That command moves `src/components` and root app files into `apps/demo/src`, moves `src/hooks` into `packages/react/src/hooks`, rewrites legacy relative imports to package imports, and refuses to overwrite an existing destination. Run it once from the repository root, then run `npm test`, `npm run typecheck`, `npm run build`, and `npm run pack:check` before merging the resulting physical move.

Core remains the owner of runtime, validators, plugins, adapters, types, and contract. React owns hooks. Demo owns routes, scenes, CSS, and fixtures. Keep co-located tests and `integration/fixtures` beside the implementation they verify.
