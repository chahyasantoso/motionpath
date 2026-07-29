# MotionPath architecture and folder map

## Target boundary

```text
packages/core/src/
  domain/ engines/ errors/ lib/ usecases/ validators/ adapters/ types/ contract/
packages/react/src/hooks/
apps/demo/src/
  components/ App.jsx App.css main.jsx
```

## Extraction status

The core and React package boundaries are wired and merged. The final application slice now establishes `apps/demo` as the authoritative app entry boundary with package metadata and Vite-compatible entry files.

The existing scene implementation remains in legacy `src/components` behind a temporary compatibility bridge; the next cleanup is a physical move of those scenes and CSS, followed by deleting the bridge and switching root build config to the app workspace.

Import direction stays one-way: `apps/demo -> @motionpath/react -> @motionpath/core`.

Keep co-located tests and `integration/fixtures` beside the implementation they verify.
