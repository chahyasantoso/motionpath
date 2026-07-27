# Implementation Brief — Spiral Demo Migration to v4 Observe

> **⚠️ SUPERSEDED — historical, do not implement from this.**
> This brief assumed the composition half would be wired through
> `containerInstance.addChild('spiral-zuma')` → `baseInstance.getTrack(...)` and
> `mountInstance('ball-exit')` overlays. That route is **wrong for this engine**:
> `Engine.mountInstance` is a singleton-per-id registry (the 2nd mount of a
> motion destroys the 1st), so it cannot back 30 concurrent balls. The demo was
> instead implemented **Track-direct** (bare `createTrack` + `parentTrack.addChild`),
> and then reworked so those tracks are **stamped from the loaded schema config**
> via `engine.getTrackConfig(...)` rather than inline keyframes.
> **Current design of record:** `feature-swarm-design.md` §"Part A′: Track-direct swarm".
> The observe wiring itself (setObserved/removeObserved, the stale-entrance guard,
> the `setObserved(null)` hard-replace on exit) landed as described below and is
> still accurate — only the _track-acquisition_ mechanism (Steps 0–2, and the
> `mountInstance`/`baseInstance`/`getTrack` calls in Steps 3–4) is obsolete.

---

**Branch:** `v4`
**Files under change:** `src/components/Spiral/SpiralBall.jsx`, `src/components/Spiral/useSpiralWaveController.js`, `src/components/Spiral/createBallVm.js`
**Design context:** `progress/v4/observe-fk-design.md` §7 (case study). Read that section first.
**Prerequisites:** `observe-multisource-brief.md` and `compose-per-call-scoping-brief.md` implemented and passing. Verify with `npx vitest run` before touching anything.
**For implementation by:** Gemini Flash.
**Verification:** run `npx vitest run` after EACH numbered step. The Spiral demo is a UI component — also manually verify in the browser after Step 4.

---

## What this brief does

The Spiral demo currently uses v3 machinery: each ball holds two `MotionInstance` references (`baseInstance` / `activeInstance`), `SpiralBall` subscribes to a variable-length `sources` array that changes mid-animation, and `mergeFn` branches on `patches.length`. This causes a subscription teardown and rebuild at the exact moment a ball starts entering or exiting.

This brief replaces the **composition half** with v4 observe:

- The ball element subscribes to **one `Track` for its whole life**.
- Entrance/exit overlays are folded in via `setObserved` / `removeObserved` — no resubscription.
- The lifecycle state machine (spawn cadence, `addChild`/`removeChild`, `play()`/`onComplete`, wave reset) is **unchanged**. Observe is a composition primitive, not a state machine.

---

## Background — what the v3 code does today

Read these three files before starting. Do not modify them yet.

**`createBallVm.js`** — creates a vm with `baseInstance`, `activeInstance`, `activeTrackId`, `status`.

**`useSpiralWaveController.js`** — the lifecycle state machine:

- `spawnBall`: calls `containerInstance.addChild('spiral-zuma')` → gets a `baseInstance` (a v3 MotionInstance). Calls `startEntrance(id)`.
- `startEntrance`: mounts a second instance (`ball-exit` motion, `ball-entrance-track`), plays it, on complete swaps vm back to `baseInstance`.
- `startExit`: mounts a second instance (`ball-exit` motion, `ball-exit-track`), plays it, on complete calls `containerInstance.removeChild` and removes the vm.
- `baseInstance.onComplete` → auto-triggers `startExit` when the ball reaches the end of the path.

**`SpiralBall.jsx`** — subscribes to `[baseSource]` or `[baseSource, transitionSource]` depending on `vm.activeInstance !== vm.baseInstance`. `mergeFn` does `{...base, ...transition}` when two patches are present.

The problem: when `activeInstance` changes, `sourcesSignature` changes, the `useEffect` in `useMotionSubscribers` tears down and rebuilds the subscription mid-animation.

---

## What v4 provides that replaces the composition half

Each `MotionInstance` in v4 exposes its tracks. The ball's path track is a `Track` instance. `Track.setObserved(overlayTrack, mapFn)` folds the overlay's scale/opacity into the ball track's compose output, applied last (overrides). `Track.removeObserved(overlayTrack)` removes it. The element subscribes to the ball track once and never resubscribes.

The overlay tracks (entrance/exit) are still separate `MotionInstance`s driven by the existing lifecycle — only the _render wiring_ changes.

---

## Step 0 — confirm prerequisites and locate the ball track

```bash
npx vitest run
```

All tests must pass. Then confirm how to get the ball's `Track` from a v4 `MotionInstance`. The ball instance is created by `containerInstance.addChild('spiral-zuma')` — check what that returns and how to get the `ball-track` Track from it:

```bash
grep -n "getTrack\|tracksMap\|addChild" src/lib/Motion.js | head -20
```

You need to know the exact call to retrieve a named Track from a Motion instance before writing any code. If it is `instance.getTrack('ball-track')`, use that. If it is `instance.tracksMap.get('ball-track')`, use that. Do not guess — read the actual API.

---

## Step 1 — extend `createBallVm.js` to hold the ball Track

Add a `ballTrack` field. This is the single track the element will subscribe to for its whole life.

```js
export function createBallVm({ id, color, baseInstance, ballTrack }) {
  return {
    id,
    color,
    baseInstance,
    ballTrack, // ← the Track the element subscribes to (never changes)
    status: "active",
    isClickable: true,
    onClick: () => {},
  };
}
```

Remove `activeInstance` and `activeTrackId` — they are no longer needed.

Run `npx vitest run`. Must still pass (no tests directly cover createBallVm).

---

## Step 2 — update `spawnBall` in `useSpiralWaveController.js` to extract the ball Track

In `spawnBall`, after `containerInstance.addChild('spiral-zuma')` returns `baseInstance`, extract the ball Track and pass it to `createBallVm`:

```js
const spawnBall = useCallback(() => {
  if (!containerInstance) return;

  const baseInstance = containerInstance.addChild("spiral-zuma");
  if (!baseInstance) return;

  // Extract the ball's path Track — this is what the element subscribes to.
  // Use the exact API you confirmed in Step 0.
  const ballTrack = baseInstance.getTrack("ball-track"); // adjust if API differs
  if (!ballTrack) return;

  const id = ++ballCounterRef.current;
  const color = BALL_COLORS[id % BALL_COLORS.length];

  const vm = createBallVm({ id, color, baseInstance, ballTrack });
  vm.onClick = () => startExit(id);

  ballVmsRef.current = [...ballVmsRef.current, vm];
  setBallVms(ballVmsRef.current);

  startEntrance(id);

  baseInstance.onComplete(() => {
    const current = getBallVm(id);
    if (!current) return;
    if (current.status !== "active") return;
    startExit(id);
  });
}, [containerInstance, startEntrance, startExit, getBallVm]);
```

Run `npx vitest run`. Must still pass.

---

## Step 3 — update `startEntrance` to use `setObserved` instead of swapping `activeInstance`

The entrance overlay animates `scale` and `opacity`. Wire it via `setObserved` on the ball Track.

**Critical ordering:** `removeObserved(entranceTrack)` MUST be called BEFORE `entranceTrack.destroy()`. The ball survives entrance-complete, so the ball Track would otherwise hold a reference to a destroyed track and call `compose()` on it next tick.

```js
const startEntrance = useCallback(
  (ballId) => {
    const current = getBallVm(ballId);
    if (!current) return;

    const entranceInstance = productionEngine.mountInstance("ball-exit");
    if (!entranceInstance) return;

    // Get the entrance overlay Track.
    const entranceTrack = entranceInstance.getTrack("ball-entrance-track"); // adjust if API differs
    if (!entranceTrack) return;

    // Fold entrance scale/opacity into the ball Track's compose output.
    current.ballTrack.setObserved(entranceTrack, (patch) => ({
      scale: patch.scale,
      opacity: patch.opacity,
    }));

    // Status update — no longer need activeInstance/activeTrackId.
    updateBallVm(ballId, { status: "spawning", isClickable: false });

    entranceInstance.play();
    entranceInstance.onComplete(() => {
      const latest = getBallVm(ballId);
      if (!latest) return;

      // Guard: a fast click during entrance may have already started the exit
      // (status 'exiting'), which cleared observations and folded the exit overlay.
      // In that case the entrance is stale — clean up its instance but do NOT
      // touch observations (exit owns them now) and do NOT flip status back to active.
      if (latest.status !== "spawning") {
        entranceInstance.destroy();
        return;
      }

      // MUST clear before destroy — ball Track survives, entranceTrack does not.
      latest.ballTrack.removeObserved(entranceTrack);
      entranceInstance.destroy();

      updateBallVm(ballId, { status: "active", isClickable: true });
    });
  },
  [getBallVm, updateBallVm],
);
```

Run `npx vitest run`. Must still pass.

---

## Step 4 — update `startExit` to use `setObserved` instead of swapping `activeInstance`

Exit-complete removes the whole ball, so the ball Track dies with it — no explicit `removeObserved` needed on exit-complete. The `setObserved` call replaces any existing observation (entrance may still be active if the user clicks very fast — `setObserved` with the same or a new source replaces without throwing).

```js
const startExit = useCallback(
  (ballId) => {
    const current = getBallVm(ballId);
    if (!current) return;
    if (current.status === "exiting") return;

    const exitInstance = productionEngine.mountInstance("ball-exit");
    if (!exitInstance) {
      containerInstance?.removeChild(current.baseInstance);
      removeBallVm(ballId);
      return;
    }

    const exitTrack = exitInstance.getTrack("ball-exit-track"); // adjust if API differs
    if (!exitTrack) {
      exitInstance.destroy();
      containerInstance?.removeChild(current.baseInstance);
      removeBallVm(ballId);
      return;
    }

    // Fold exit scale/opacity into the ball Track's compose output.
    // Clear ALL observations first so a still-active entrance overlay (fast click
    // during entrance) is hard-replaced immediately — exit is the sole overlay.
    current.ballTrack.setObserved(null);
    current.ballTrack.setObserved(exitTrack, (patch) => ({
      scale: patch.scale,
      opacity: patch.opacity,
    }));

    updateBallVm(ballId, { status: "exiting", isClickable: false });

    exitInstance.play();
    exitInstance.onComplete(() => {
      exitInstance.destroy();

      const latest = getBallVm(ballId);
      if (!latest) return;

      // Ball Track dies with the ball — no removeObserved needed.
      const aliveAfter = containerInstance
        ? containerInstance.children.length - 1
        : 0;
      console.log(`[wave] remove ball #${ballId} | alive after: ${aliveAfter}`);

      containerInstance?.removeChild(latest.baseInstance);
      removeBallVm(ballId);
    });
  },
  [containerInstance, getBallVm, removeBallVm, updateBallVm],
);
```

Run `npx vitest run`. Must still pass.

---

## Step 5 — simplify `SpiralBall.jsx`

The element now subscribes to one track for its whole life. Remove the variable-length sources, the `activeInstance`/`activeTrackId` branching, and the `mergeFn`.

```jsx
import { useRef } from "react";
import useMotionSubscribers from "../../hooks/useMotionSubscribers";

export default function SpiralBall({ vm }) {
  const ref = useRef(null);

  const source = {
    track: vm.ballTrack,
    transformFn: (rawData, compose) => {
      const p = rawData?.pathProgress ?? 0;
      if (p <= 0 || p >= 1) return { display: "none", opacity: 0 };
      return { ...compose(rawData), display: "flex" };
    },
  };

  useMotionSubscribers([source], ref);

  return (
    <div
      ref={ref}
      className="element spiral-ball"
      onClick={vm.isClickable ? vm.onClick : undefined}
      style={{ "--ball-color": vm.color }}
    />
  );
}
```

Note: `transformTransition` is no longer needed — delete it or leave it unused (it is not exported to other files, so either is safe).

Run `npx vitest run`. Must still pass. Then verify in the browser:

- Balls spawn and travel the spiral path.
- Entrance animation (scale pop-in) plays on spawn.
- Clicking a ball triggers the exit animation (scale-up then fade).
- Balls that reach the end auto-exit.
- The wave resets after 30 balls.

---

## Step 6 — final checklist

Before reporting done:

- [ ] `npx vitest run` — all tests pass, zero failures.
- [ ] `createBallVm` has `ballTrack`, no `activeInstance`, no `activeTrackId`.
- [ ] `spawnBall` extracts `ballTrack` from `baseInstance` and passes it to `createBallVm`.
- [ ] `startEntrance` calls `ballTrack.setObserved(entranceTrack, mapFn)` and, on complete, guards `status === 'spawning'` before touching observations/status; when stale it only destroys the instance. In the live path it calls `ballTrack.removeObserved(entranceTrack)` **before** `entranceInstance.destroy()`.
- [ ] `startExit` calls `ballTrack.setObserved(null)` then `ballTrack.setObserved(exitTrack, mapFn)` — hard-replaces any active entrance overlay; no `removeObserved` on complete (ball dies).
- [ ] Browser: fast-click a ball _during_ its entrance pop-in — it must transition straight into the exit animation (no snap back to full size, no double overlay) and remain non-clickable.
- [ ] `SpiralBall.jsx` subscribes to `[{ track: vm.ballTrack, transformFn }]` — one source, no `mergeFn`.
- [ ] No `activeInstance`, `activeTrackId`, `patches.length` branching, or `transformTransition` call anywhere in the three changed files.
- [ ] Browser: spawn, entrance, click-exit, auto-exit, and wave-reset all work correctly.

---

## What this brief does NOT change

- The spawn cadence RAF loop — unchanged.
- `containerInstance.addChild` / `containerInstance.removeChild` — unchanged.
- `baseInstance.onComplete` auto-exit trigger — unchanged.
- The wave reset (`spawnedCountRef`, `containerInstance.timeline.play(0)`) — unchanged.
- The `ball-exit` and `ball-entrance-track` motion schemas in `spiralMotions.js` — unchanged.
- `productionEngine.mountInstance` — unchanged.
- Any other demo component — unchanged.
