# MotionPath v4.1 Refactor Implementation Plan

**Status:** proposed execution baseline  
**Base branch:** `v4.1`  
**Source:** MotionPath v4 architecture review  
**Goal:** harden the runtime contract and establish a package boundary without rewriting the animation model.

## Guiding principles

- Preserve the data-first, renderer-agnostic runtime model.
- Keep GSAP as the scheduling owner. No second RAF or competing clock.
- Keep React, DOM, and demo scenes outside the core runtime.
- Make invalid states fail early with actionable paths.
- Prefer small, reversible phases with tests before behavior changes.
- Treat the schema, declarations, validators, and docs as one public contract.

## Definition of done for v4.1

- Project reload is failure-atomic.
- Parser, compiler, and mount paths use one injected dependency graph.
- Plugin and trigger registries are isolated per Engine by default.
- Runtime cleanup is idempotent and tested under partial failures.
- Schema declarations, validators, fixtures, and docs agree.
- Core runtime can be built and consumed without React or demo imports.
- CI verifies tests, typecheck, lint, build, package contents, and browser smoke coverage.
- The demo app remains functional while depending on the extracted core boundary.

## Phase 0: baseline and guardrails

**Deliverables**

- Record the starting commit, test count, typecheck result, bundle size, and package contents.
- Add a lightweight architecture test that fails if core imports React, JSX, DOM globals, or demo components.
- Add `lint`, `build`, `coverage`, and `pack:check` scripts.
- Pin supported Node and package-manager versions in CI and documentation.
- Add CODEOWNERS and a short contribution guide for runtime changes.

**Exit criteria**

- Existing tests and typecheck are green.
- New guardrails run in CI without changing runtime behavior.

## Phase 1: unify runtime dependencies

**Deliverables**

- Introduce a `RuntimeDependencies` object containing plugin registry, trigger registry, event bus, GSAP adapter, clock/ticker adapter, and environment capabilities.
- Make `Engine` create or receive this object once.
- Pass the same dependencies through `parseV4Project`, `createTrack`, `buildTrackTween`, Motion, Track, and subscribers.
- Remove hidden module-level fallback resolution from internal code paths.
- Keep default factories only at the public constructor boundary.

**Tests**

- Two Engines with different plugin registries resolve different plugins for the same key.
- A custom trigger registry is honored during parse and mount.
- A plugin cannot be prepared with one registry and compiled with another.

**Exit criteria**

- Every runtime object has one observable dependency source.
- No test needs to mutate global plugin state to configure an Engine.

## Phase 2: make loading transactional

**Deliverables**

- Parse and prepare a candidate project before replacing the active project.
- Preserve the current project and mounted instances if candidate loading fails.
- Define behavior for `loadProject()` while instances are mounted.
- Return or expose a normalized project report for debugging.
- Add explicit error context for plugin load, preparation, trigger, and track failures.

**Tests**

- Invalid schema leaves the active project untouched.
- Lazy plugin rejection leaves the active project untouched.
- Preparation rejection leaves the active project untouched.
- Successful reload destroys the old project only after the new project is ready.

**Exit criteria**

- Reload behaves transactionally and is documented.

## Phase 3: establish one canonical contract

**Deliverables**

- Define canonical schema and plugin contract types in `src/contract`.
- Generate or mechanically verify JSDoc and TypeScript declarations from the canonical types.
- Align validator rules, parser assumptions, docs, and fixtures.
- Define observation semantics, plugin output merge metadata, trigger fields, and unsupported-plugin behavior in one place.
- Add a versioned contract fixture suite.

**Tests**

- Every public example validates and parses.
- Every declared field is either implemented or rejected explicitly.
- Negative fixtures assert exact rule IDs and useful paths.

**Exit criteria**

- No field exists only in docs or only in implementation.

## Phase 4: normalize once at compile time

**Deliverables**

- Add an immutable normalized project representation.
- Resolve templates once and retain source-to-normalized diagnostics.
- Resolve plugin ownership once per track.
- Precompute track duration, keyframe percent keys, observation edges, and trigger configuration.
- Let mounting consume normalized configs without repeating template resolution.

**Tests**

- Normalization is deterministic and does not mutate authored input.
- Mounting a normalized track does not perform template lookup again.
- Equivalent authored inputs produce equivalent normalized output.

**Exit criteria**

- Validation, parsing, and mounting share the same normalized representation.

## Phase 5: harden Engine, Motion, and Track lifecycle

**Deliverables**

- Make construction failure-safe: every partially created GSAP timeline/tween is cleaned up.
- Make `unmount()` and `destroy()` idempotent and ownership-aware.
- Replace ambiguous `getTrack()` behavior with explicit instance lookup APIs.
- Define duplicate motion and track ID policy.
- Define behavior for mounting after destroy, unmounting foreign objects, and destroying during callbacks.
- Add lifecycle state assertions in development builds.

**Tests**

- Repeated destroy and unmount.
- Destroy during onComplete and subscriber callbacks.
- Partial mount failure after one track has been created.
- Concurrent instances with the same authored motion ID.
- Foreign object passed to `unmount()`.

**Exit criteria**

- No leaked timelines, subscriptions, observations, or registry handles in failure tests.

## Phase 6: isolate and harden the plugin system

**Deliverables**

- Make per-Engine registries the primary API.
- Keep global registration as an explicitly documented compatibility layer.
- Add plugin lifecycle phases: register, load, prepare, compile, compose, dispose where needed.
- Validate plugin metadata at registration time.
- Define collision rules for keys, inputs, outputs, ease fields, and tween vars.
- Document lazy plugin retry and failure behavior.

**Tests**

- Registry isolation and reset behavior.
- Exact, predicate, wildcard, and lazy plugin resolution.
- Collision failures with actionable messages.
- Plugin output serialization and internal-key filtering.

**Exit criteria**

- Plugin authors can implement and test a plugin without importing Engine internals.

## Phase 7: observation graph correctness

**Deliverables**

- Add explicit graph validation before runtime mounting.
- Validate missing sources, invalid targets, duplicate edges, self-cycles, and ambiguous output merges.
- Formalize input versus output observation mapping.
- Add graph diagnostics to validation reports.
- Ensure removing a source removes or invalidates dependent edges predictably.

**Tests**

- Cycle, diamond, missing source, input observation, output observation, and replacement scenarios.
- Stable composition order and merge behavior.
- Context does not leak across frames or external compose calls.

**Exit criteria**

- Graph errors are reported before GSAP runtime construction.

## Phase 8: renderer and subscriber lifecycle

**Deliverables**

- Define a renderer-neutral patch type and complete-patch semantics.
- Make subscriber bindings return one disposer that unsubscribes and clears renderer cache.
- Guarantee cleanup on target replacement, route change, and component unmount.
- Keep serializers and internal-key metadata plugin-owned.
- Add adapters for DOM and headless rendering.

**Tests**

- Dirty diff skips unchanged writes.
- Omitted properties are removed.
- Serializer output is applied exactly once.
- Internal and framework keys never reach a renderer.
- Target replacement clears stale cache.

**Exit criteria**

- Renderer behavior is deterministic and independently testable without React.

## Phase 9: remove platform side effects from core

**Deliverables**

- Move ScrollTrigger registration behind an explicit GSAP/browser adapter.
- Make SSR and headless test imports safe.
- Define browser capability detection and clear errors for unavailable trigger adapters.
- Add a no-DOM core test environment.

**Tests**

- Core imports in Node without DOM globals.
- Scroll adapter is opt-in and registered once.
- Time and manual triggers work headlessly.

**Exit criteria**

- Core package has no import-time browser registration side effects.

## Phase 10: TypeScript migration of the runtime core

**Migration order**

1. Canonical contract and diagnostics.
2. Validators and normalization.
3. Plugin registry and built-in plugins.
4. Track composition and renderer-neutral patches.
5. Motion, trigger adapters, and Engine.
6. React hooks and integration types.

**Deliverables**

- `allowJs` can be disabled for the core package.
- Public declarations are emitted from implementation types.
- Strict null checks and no implicit any apply to runtime code.
- JavaScript demo components can consume the typed package boundary.

**Exit criteria**

- No hand-maintained duplicate public declaration file for core APIs.

## Phase 11: package boundary extraction

**Target layout**

```text
packages/core     # schema, validation, compiler, runtime, plugins, adapters
packages/react    # hooks and React subscriber bindings
apps/demo         # routes, scenes, assets, visual fixtures
```

**Deliverables**

- Add package exports and prevent deep imports into private files.
- Core package has no React dependency.
- React package depends on core, never the reverse.
- Demo depends on React integration and core.
- Add workspace-level build and test orchestration.
- Publish dry-run package and inspect its contents.

**Exit criteria**

- `npm pack` for core contains only intended runtime artifacts.
- A clean consumer fixture can import core without Vite or React.

## Phase 12: performance and browser verification

**Deliverables**

- Add compile and compose benchmarks for small, medium, and large projects.
- Add subscriber batching and DOM-write budgets.
- Add browser smoke tests for time, manual, and scroll triggers.
- Add route-change teardown tests for the demo app.
- Add memory-oriented tests for repeated mount/unmount cycles.

**Exit criteria**

- Performance budgets are visible in CI.
- Browser smoke coverage catches integration regressions that unit tests cannot.

## Phase 13: documentation and release readiness

**Deliverables**

- Rewrite README around package installation and a minimal runtime example.
- Split system architecture, schema reference, plugin authoring, renderer authoring, and migration docs.
- Add an ADR for each irreversible architectural decision.
- Add a compatibility and deprecation policy.
- Add a v4 to v4.1 migration guide.
- Tag a release candidate and publish a changelog.

**Exit criteria**

- A new contributor can validate, mount, render, test, and extend a motion without reading progress notes.

## Suggested issue / PR sequence

Keep each PR narrow and mergeable:

1. Guardrails and CI scripts.
2. Runtime dependency object.
3. Transactional loading.
4. Canonical contract and fixture matrix.
5. Normalized project representation.
6. Lifecycle hardening.
7. Registry isolation and plugin metadata checks.
8. Observation graph validation.
9. Renderer disposer and cache lifecycle.
10. Platform adapter extraction.
11. Runtime TypeScript migration.
12. Core package extraction.
13. Browser/performance verification.
14. Documentation and release candidate.

## Risk register

| Risk                                              | Impact | Mitigation                                                          |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Contract changes break demo scenes                | High   | Normalize fixtures first; add migration diagnostics                 |
| GSAP timing behavior changes during adapter work  | High   | Characterization tests around progress, repeat, scrub, and teardown |
| TypeScript migration expands scope                | Medium | Migrate core in dependency order; leave demos for last              |
| Global plugin consumers regress                   | Medium | Compatibility layer plus deprecation window                         |
| Package extraction breaks deep imports            | Medium | Export map, consumer fixture, and migration guide                   |
| Performance regresses through extra normalization | Medium | Benchmark before and after; cache normalized configs                |
| Browser-only triggers fail in CI                  | Low    | Use explicit browser adapters and headless trigger tests            |

## Working cadence to save review and AI cost

- One phase per PR.
- Start every PR with a failing regression test or contract fixture.
- Reuse the phase checklist in the PR body instead of re-explaining architecture.
- Prefer repository-wide searches and focused file reads over repeated full scans.
- Keep generated declarations and docs in the same change as their source contract.
- Do not combine package extraction with behavioral changes.
- Merge only when the phase exit criteria and CI checks are green.

## First execution slice

The first implementation PR after this plan should cover only Phase 0:

- Add architecture boundary checks.
- Add lint, build, coverage, and package-check scripts where tooling already exists.
- Pin CI runtime versions.
- Record baseline metrics.
- Do not change animation behavior.
