# Spiral ViewModel Refactor Plan

This document describes the exact implementation plan for refactoring the Spiral demo in `chahyasantoso/motionpath` branch `v3` from the current instance-centric React component structure to a ViewModel-driven structure while preserving the newly added entrance animation behavior [cite:4].

The goal is to keep the engine as-is, keep `useMotionSubscriber`, and move orchestration logic out of `SpiralPage.jsx` and out of component-local state in `SpiralBall` into a small React controller layer [cite:4].

## Objective

The current Spiral implementation still uses the old pattern where `SpiralPage.jsx` stores render state plus a separate instance map, and `SpiralBall` owns local state for `activeInstance` and `activeTrackId` [cite:4]. The entrance animation added in the latest code works visually, but it increases component-level orchestration because `SpiralBall` now mounts a temporary entrance instance, swaps tracks, and returns to the base path-follow instance on completion [cite:4].

The refactor should preserve that behavior exactly, but move the state transitions into a ViewModel/controller hook so the page becomes mostly presentational and each ball is rendered from a single `BallVm` object [cite:4].

## Current State Summary

The current file does all of the following in one place or split across the page and ball component [cite:4]:

- Defines config constants and path generation.
- Builds the project motion schemas.
- Loads the motion project and root container instance.
- Spawns path-following child instances.
- Stores render state in `balls`.
- Stores instance lookups in `ballInstancesMap`.
- Uses `SpiralBall` local state to switch among `ball-track`, `ball-entrance-track`, and `ball-exit-track`.
- Uses `instance.getCurrentSnapshot('ball-track')` and `instance.compose(...)` during entrance and exit composition [cite:4].

This works, but it spreads responsibility across too many places.

## Target Architecture

The refactor should end in this shape [cite:4]:

| Layer | Responsibility |
|---|---|
| `spiralConfig.js` / `spiralPath.js` | Pure config and path math |
| `spiralMotions.js` | Motion schema creation |
| `useSpiralWaveController.js` | Ball lifecycle, wave spawning, entrance/exit transitions, removal |
| `useSpiralPageViewModel.js` | Small page-facing adapter returning renderable view data |
| `SpiralPage.jsx` | Presentational page only |
| `SpiralBall.jsx` | Bind one `BallVm` to DOM with `useMotionSubscriber` |

The page should no longer manage ball ids, instance maps, or child removal directly [cite:4].

## Rules

Follow these rules strictly [cite:4]:

1. Do not redesign the engine.
2. Do not remove `useMotionSubscriber`.
3. Do not add Zustand, Redux, Context, or another global state library.
4. Do not change the visual behavior of entrance, path travel, exit, or reflow.
5. Do not change spawn spacing rules unless required for correctness.
6. Keep the implementation local to the Spiral feature.

## New File Structure

Create or update these files:

```text
src/components/Spiral/
  SpiralPage.jsx
  SpiralBall.jsx
  SpiralPage.css
  spiralConfig.js
  spiralPath.js
  spiralMotions.js
  createBallVm.js
  useSpiralWaveController.js
  useSpiralPageViewModel.js
```

If `SpiralBall.jsx` is not extracted yet, create it as part of this refactor.

## Ball ViewModel Design

Use a ball view model as the single renderable representation of one ball [cite:4].

Suggested shape:

```ts
type BallVm = {
  id: number;
  color: string;

  baseInstance: MotionInstance;
  activeInstance: MotionInstance;
  activeTrackId: 'ball-track' | 'ball-entrance-track' | 'ball-exit-track';

  status: 'spawning' | 'active' | 'exiting';
  isClickable: boolean;

  onClick: () => void;
};
```

Definitions:

- `baseInstance`: the real child instance attached to `spiral-container` and moving on the spiral path [cite:4].
- `activeInstance`: the instance currently subscribed by the UI. This is normally `baseInstance`, but temporarily becomes the entrance or exit instance during transitions [cite:4].
- `activeTrackId`: the track the UI should subscribe to now [cite:4].
- `status`: the lifecycle state used by controller logic.
- `onClick`: the action exposed to the UI.

## Step 1: Extract Config and Path Utilities

Move these out of `SpiralPage.jsx` [cite:4]:

- `SPIRAL_CONFIG`
- `BALL_COLORS`
- `BALL_SIZE`
- `BALL_SPEED`
- `generateSpiralPoints`
- `calculatePathLength`
- `BALL_TRAVEL_SECONDS`
- `SPAWN_INTERVAL_MS`
- `MIN_SPAWN_PROGRESS`

Create:

### `spiralConfig.js`

```ts
export const SPIRAL_CONFIG = { cx: 640, cy: 360, outerR: 340, innerR: 32, turns: 3.5 };
export const BALL_COLORS = [
  '#ff6bca', '#7c5cff', '#00e5ff', '#ffb347',
  '#69ff47', '#ff4747', '#ffd700', '#b0ff47',
  '#ff69b4', '#00ffaa', '#ff8c00', '#44aaff',
];
export const BALL_SIZE = 50;
export const BALL_SPEED = 120;
```

### `spiralPath.js`

Move the path math there and export:

```ts
export function generateSpiralPoints(...) {}
export function calculatePathLength(points) {}
export const spiralPathPoints = ...;
export const totalPathLength = ...;
export const BALL_TRAVEL_SECONDS = ...;
export const SPAWN_INTERVAL_MS = ...;
export const MIN_SPAWN_PROGRESS = ...;
```

Do not change the formulas [cite:4].

## Step 2: Extract Motion Schemas

Move all motion schema objects into `spiralMotions.js` [cite:4].

The current project defines:

- `spiral-zuma` with `ball-track`
- `ball-exit` with `ball-exit-track` and `ball-entrance-track`
- `spiral-container` with stagger and keepalive [cite:4]

Create a factory:

```ts
export function createSpiralProject({
  spiralPathPoints,
  ballTravelSeconds,
  ballSize,
  spawnIntervalMs,
}) {
  return {
    schemaVersion: 2,
    projectId: 'spiral-zuma-page',
    perspective: 1200,
    motions: [
      createSpiralContainerScene({ spawnIntervalMs }),
      createSpiralBallScene({ spiralPathPoints, ballTravelSeconds, ballSize }),
      createSpiralTransitionScene({ ballSize }),
    ],
  };
}
```

Keep the exact current entrance and exit keyframes unless there is a syntax bug to fix [cite:4].

## Step 3: Create `createBallVm.js`

This helper should create a new VM for each spawned ball.

Suggested implementation:

```ts
export function createBallVm({ id, color, baseInstance }) {
  return {
    id,
    color,
    baseInstance,
    activeInstance: baseInstance,
    activeTrackId: 'ball-track',
    status: 'active',
    isClickable: true,
    onClick: () => {},
  };
}
```

This file should stay tiny.

## Step 4: Build `useSpiralWaveController.js`

This is the main implementation file. It should own all lifecycle behavior now handled across `SpiralPage.jsx` and `SpiralBall` local state [cite:4].

The hook should manage:

- ball vm state
- id counter
- spawned count
- requestAnimationFrame spawn loop
- entrance transition start/finish
- exit transition start/finish
- base instance completion -> exit flow
- removal from container
- wave reset when all active children are gone [cite:4]

### Hook state

Use local feature state only:

```ts
const [ballVms, setBallVms] = useState([]);
const ballVmsRef = useRef([]);
const ballCounterRef = useRef(0);
const spawnedCountRef = useRef(0);
const rafIdRef = useRef(null);
```

Sync state to ref:

```ts
useEffect(() => {
  ballVmsRef.current = ballVms;
}, [ballVms]);
```

This ref mirror is required so async callbacks always see the latest VM state instead of stale closures.

### Helper functions

Add small helpers:

```ts
function getBallVm(ballId) {
  return ballVmsRef.current.find(ball => ball.id === ballId) ?? null;
}

function updateBallVm(ballId, patch) {
  setBallVms(prev => prev.map(ball => ball.id === ballId ? { ...ball, ...patch } : ball));
}

function removeBallVm(ballId) {
  setBallVms(prev => prev.filter(ball => ball.id !== ballId));
}
```

Keep these simple. Do not over-generalize.

## Step 5: Move Spawn Logic Into Controller

Take the current `addBall()` logic from `SpiralPage.jsx` and move it into the controller [cite:4].

Required behavior:

1. Create `baseInstance` with `containerInstance.addChild('spiral-zuma')`.
2. Increment ball id counter.
3. Pick color using existing color array.
4. Create `BallVm` from `createBallVm`.
5. Attach `onClick` handler that starts exit.
6. Add the VM to state.
7. Immediately start the entrance animation.
8. Register `baseInstance.onComplete()` to trigger the same exit flow used by click.

Suggested pseudocode:

```ts
function spawnBall() {
  if (!containerInstance) return;

  const baseInstance = containerInstance.addChild('spiral-zuma');
  if (!baseInstance) return;

  const id = ++ballCounterRef.current;
  const color = BALL_COLORS[id % BALL_COLORS.length];

  const vm = createBallVm({ id, color, baseInstance });
  vm.onClick = () => startExit(id);

  setBallVms(prev => [...prev, vm]);
  startEntrance(id);

  baseInstance.onComplete(() => {
    const current = getBallVm(id);
    if (!current) return;
    if (current.status !== 'active') return;
    startExit(id);
  });
}
```

Important: auto-complete and click should share the same exit logic. Do not keep two removal pipelines.

## Step 6: Move Entrance Transition Into Controller

Right now `SpiralBall` mounts an entrance instance on mount, swaps local state, then swaps back to the base path track when the entrance completes [cite:4]. Move that behavior into the controller.

Create `startEntrance(ballId)`.

Required behavior:

1. Find current ball VM.
2. Mount `productionEngine.mountInstance('ball-exit')` because the entrance track currently lives inside that motion definition [cite:4].
3. Update the VM to use:
   - `activeInstance = entranceInstance`
   - `activeTrackId = 'ball-entrance-track'`
   - `status = 'spawning'`
   - `isClickable = false`
4. Play the entrance instance.
5. On complete:
   - destroy the entrance instance
   - restore `activeInstance = baseInstance`
   - restore `activeTrackId = 'ball-track'`
   - set `status = 'active'`
   - set `isClickable = true`

Suggested pseudocode:

```ts
function startEntrance(ballId) {
  const current = getBallVm(ballId);
  if (!current) return;

  const entranceInstance = productionEngine.mountInstance('ball-exit');
  if (!entranceInstance) return;

  updateBallVm(ballId, {
    activeInstance: entranceInstance,
    activeTrackId: 'ball-entrance-track',
    status: 'spawning',
    isClickable: false,
  });

  entranceInstance.play();
  entranceInstance.onComplete(() => {
    entranceInstance.destroy();

    const latest = getBallVm(ballId);
    if (!latest) return;

    updateBallVm(ballId, {
      activeInstance: latest.baseInstance,
      activeTrackId: 'ball-track',
      status: 'active',
      isClickable: true,
    });
  });
}
```

Do not use component-local `useState` for this anymore.

## Step 7: Move Exit Transition Into Controller

Right now click removal is controlled inside `SpiralBall` local state [cite:4]. Move that into `startExit(ballId)`.

Required behavior:

1. Find the current VM.
2. If not found, return.
3. If already exiting, return.
4. Mount `productionEngine.mountInstance('ball-exit')`.
5. Update VM to:
   - `activeInstance = exitInstance`
   - `activeTrackId = 'ball-exit-track'`
   - `status = 'exiting'`
   - `isClickable = false`
6. Play the exit instance.
7. On complete:
   - destroy exit instance
   - remove `baseInstance` from `containerInstance`
   - remove the VM from state

Suggested pseudocode:

```ts
function startExit(ballId) {
  const current = getBallVm(ballId);
  if (!current) return;
  if (current.status === 'exiting') return;

  const exitInstance = productionEngine.mountInstance('ball-exit');
  if (!exitInstance) {
    containerInstance?.removeChild(current.baseInstance);
    removeBallVm(ballId);
    return;
  }

  updateBallVm(ballId, {
    activeInstance: exitInstance,
    activeTrackId: 'ball-exit-track',
    status: 'exiting',
    isClickable: false,
  });

  exitInstance.play();
  exitInstance.onComplete(() => {
    exitInstance.destroy();

    const latest = getBallVm(ballId);
    if (!latest) return;

    containerInstance?.removeChild(latest.baseInstance);
    removeBallVm(ballId);
  });
}
```

Keep the fallback path for when `mountInstance` fails.

## Step 8: Keep Visual Composition Inside `SpiralBall`

Do **not** remove `useMotionSubscriber` [cite:4]. `SpiralBall` should still subscribe to the current active motion source.

However, `SpiralBall` should stop owning lifecycle state like `activeInstance`, `activeTrackId`, `isRemoving`, or `isSpawning` in local hooks [cite:4]. Those values now come from the VM.

### New `SpiralBall` props

Use:

```ts
function SpiralBall({ vm }) {}
```

### New render logic

The component should:

- create `ref`
- build a `transform` callback
- call `useMotionSubscriber(vm.activeInstance, vm.activeTrackId, ref, transform)`
- render the element using `vm.color` and `vm.onClick`

Suggested implementation shape:

```jsx
import { useCallback, useRef } from 'react';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';

export default function SpiralBall({ vm }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    if (vm.activeTrackId === 'ball-exit-track' || vm.activeTrackId === 'ball-entrance-track') {
      const currentParentSnapshot = vm.baseInstance.getCurrentSnapshot('ball-track');
      if (!currentParentSnapshot) return composeFn(rawData);

      const parentComposed = vm.baseInstance.compose('ball-track', currentParentSnapshot);
      const transitionData = composeFn(rawData);

      return {
        ...parentComposed,
        ...transitionData,
        display: 'flex',
      };
    }

    const p = rawData.pathProgress ?? 0;
    if (p <= 0 || p >= 1) {
      return { display: 'none', opacity: 0 };
    }

    const composed = composeFn(rawData);
    return { ...composed, display: 'flex' };
  }, [vm]);

  useMotionSubscriber(vm.activeInstance, vm.activeTrackId, ref, transform);

  return (
    <div
      ref={ref}
      className="element spiral-ball"
      onClick={vm.isClickable ? vm.onClick : undefined}
      style={{ '--ball-color': vm.color }}
    />
  );
}
```

Important: keep the current compose behavior for entrance and exit because it preserves the visible animation result already implemented in the repo [cite:4].

## Step 9: Add `useSpiralPageViewModel.js`

This should be a small page-facing hook that combines page-level values into a single object.

Suggested return shape:

```ts
{
  balls: ballVms,
  spiralPathPoints,
  title: 'Zuma Spiral Flow',
  subtitle: 'Time-Driven Physics • Stagger Parent • Built-in Native Reflow',
}
```

This hook should be thin. It can call `useSpiralWaveController` and expose page-facing values without additional business logic.

## Step 10: Simplify `SpiralPage.jsx`

After the refactor, `SpiralPage.jsx` should no longer contain [cite:4]:

- `balls` state
- `ballInstancesMap`
- `ballCounter`
- `spawnedCount`
- `addBall`
- `handleAutoRemove`
- `handleClickRemove`
- entrance/exit orchestration

The page should only:

1. build the motion project
2. call `useMotionProject(project)`
3. call `useMotionInstance(isLoaded ? 'spiral-container' : null)`
4. call `useSpiralPageViewModel({ isLoaded, containerInstance })`
5. render static scene content
6. map `vm.balls` to `<SpiralBall vm={ballVm} />`

Suggested shape:

```jsx
export default function SpiralPage() {
  const project = useMemo(() => createSpiralProject(...), []);
  const isLoaded = useMotionProject(project);
  useSmoothScroll();

  const containerInstance = useMotionInstance(isLoaded ? 'spiral-container' : null);
  const vm = useSpiralPageViewModel({ isLoaded, containerInstance });

  return (
    <div className="app zuma-app">
      <header className="header zuma-header">
        <h1>Zuma <span className="spiral-accent">Spiral Flow</span></h1>
        <p className="subtitle">Time-Driven Physics • Stagger Parent • Built-in Native Reflow</p>
      </header>

      <section className="spiral-scene">
        <div className="scene-label">
          <h2>Endless Spiral <span className="spiral-accent">· Zuma Flow</span></h2>
          <p>
            Balls auto-spawn from the outer edge and spiral into the black hole. Click any ball to pop it — siblings slide smoothly to fill the gap.
          </p>
        </div>

        <div className="spiral-stage">
          <svg className="path-guide" width="100%" height="100%" aria-hidden="true">
            {/* existing SVG path guide stays unchanged */}
          </svg>

          {vm.balls.map(ballVm => (
            <SpiralBall key={ballVm.id} vm={ballVm} />
          ))}
        </div>
      </section>

      <footer className="footer zuma-footer">
        <p>© 2026 MotionPath Zuma Demo</p>
      </footer>
    </div>
  );
}
```

The page should become mostly presentational.

## Step 11: Keep Spawn Loop in Controller

Move the current requestAnimationFrame loop into `useSpiralWaveController.js` [cite:4]. Keep its behavior the same.

Required behavior:

- if fewer than 30 balls have spawned in the current wave, check the last ball’s progress
- spawn next ball when the last ball has moved at least `MIN_SPAWN_PROGRESS`
- when the target wave count is reached and the container has no active children, reset the wave and replay the container timeline [cite:4]

Use the same logic as current code, but read the last ball’s `baseInstance` from the latest VM instead of `ballInstancesMap`.

Suggested pseudocode:

```ts
useEffect(() => {
  if (!isLoaded || !containerInstance) return;

  const tick = () => {
    if (spawnedCountRef.current < 30) {
      const lastBall = ballVmsRef.current[ballVmsRef.current.length - 1] ?? null;
      const lastInstance = lastBall?.baseInstance ?? null;

      if (!lastInstance || lastInstance.timeline.progress() >= MIN_SPAWN_PROGRESS) {
        spawnBall();
        spawnedCountRef.current += 1;
      }
    } else if (containerInstance.children.length === 0) {
      spawnedCountRef.current = 0;
      containerInstance.timeline.play(0);
    }

    rafIdRef.current = requestAnimationFrame(tick);
  };

  rafIdRef.current = requestAnimationFrame(tick);

  return () => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    spawnedCountRef.current = 0;
  };
}, [isLoaded, containerInstance]);
```

Keep this implementation small. No reducer is required unless the lower model finds state updates too hard to reason about.

## Step 12: Cleanup Rules

On controller cleanup:

- cancel RAF
- reset counters
- do not leave temporary entrance or exit instances alive
- if helper cleanup functions are added, call them on unmount

The lower-level implementor should check for leaked temporary transition instances.

## Testing Checklist

The refactor is done only if all of these pass [cite:4]:

- A new ball still appears with the entrance animation.
- After entrance completes, the ball continues on the spiral path.
- Clicking a ball still plays exit animation.
- A ball reaching the center still uses the same exit animation path.
- Removing a ball still causes smooth sibling reflow.
- `SpiralPage.jsx` no longer stores `balls` plus `ballInstancesMap`.
- `SpiralBall` no longer stores `activeInstance` or `activeTrackId` in local React state.
- The visible animation behavior matches current repo behavior.

## Common Mistakes To Avoid

Do not make these mistakes [cite:4]:

- Do not keep both `ballInstancesMap` and `ballVms`; use only `ballVms`.
- Do not leave entrance/exit logic inside `SpiralBall` local state.
- Do not read stale `ballVms` inside async callbacks; use `ballVmsRef`.
- Do not directly remove a ball from the container before exit animation completes, except in fallback failure paths.
- Do not change `useMotionSubscriber` to solve lifecycle issues; lifecycle belongs in the controller hook.
- Do not redesign the engine for this task.

## Non-Goals

This task does **not** include [cite:4]:

- engine redesign
- multi-track live binding support
- generic motion graph dependency system
- global store introduction
- replacing `useMotionSubscriber`

## Acceptance Criteria

The implementation is acceptable when all of the following are true [cite:4]:

- `SpiralPage.jsx` is mostly presentational.
- Ball rendering is driven by `ballVms` only.
- The controller owns entrance, active, and exit transitions.
- `SpiralBall` is a thin view component that subscribes to the current active motion source.
- Entrance animation added in the current repo is preserved.
- Click removal and auto-complete removal both use the shared exit flow.
- The implementation is small, readable, and local to the Spiral feature.

## Final Implementation Order

Follow this exact order:

1. Create `spiralConfig.js`.
2. Create `spiralPath.js`.
3. Create `spiralMotions.js`.
4. Extract `SpiralBall.jsx` if not already separated.
5. Create `createBallVm.js`.
6. Implement `useSpiralWaveController.js`.
7. Implement `useSpiralPageViewModel.js`.
8. Refactor `SpiralPage.jsx` to use the new hooks and VM rendering.
9. Verify entrance, path travel, exit, and reflow all still work.

Do not skip steps. Keep each step small and verify behavior after each one [cite:4].
