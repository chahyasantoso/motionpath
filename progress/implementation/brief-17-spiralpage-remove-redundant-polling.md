# Brief 17 — Remove redundant RAF-based completion polling in SpiralPage.jsx

**Priority: MEDIUM.** Cleanup, not a live bug — `removeChild()` is idempotent so the duplication was harmless, just wasteful and confusing. Safe now that briefs 15 and 16 have fixed the root cause that originally made `onComplete` unreliable.
**Branch:** `v3`
**Files touched:** `src/components/Spiral/SpiralPage.jsx`

---

## Background

`SpiralPage` currently has two independent mechanisms that both detect "a ball finished its path and should be removed":

1. **`SpiralBall`'s own `onComplete` callback** (event-driven, correct): `instance.onComplete(() => onAutoRemove(ballData.id, instance))`.
2. **`checkAndUnspawnCompletedBalls`**, a `requestAnimationFrame`-driven poll that runs every frame, checking `inst.timeline.progress() >= 0.999` for every live ball and calling the same removal path.

Mechanism 2 was added as a workaround for a real bug — before briefs 15/16 landed, `MotionInstance.addChild()`'s position math could desync from the parent timeline's actual playhead under continuous spawn+remove, causing some balls' `onComplete` to never fire (the playhead never crossed back through their segment). Polling papered over that by catching stuck balls a different way.

That root cause is now fixed at the source (briefs 15 and 16: monotonic-then-frontmost-anchored placement, always ahead of the real playhead, immune to cascade drift). `onComplete` can be trusted again. Keeping both mechanisms going forward is a pure DRY violation — two independent code paths doing the same job, one of them doing needless O(n)-per-frame work for something an event callback already covers for free.

## Locked decision

Delete `checkAndUnspawnCompletedBalls` and its call site. Rely solely on `SpiralBall`'s `onComplete`-driven `handleAutoRemove`.

## Non-goals

- Do NOT touch `handleAutoRemove` itself, or `SpiralBall`'s `onComplete` wiring — both are correct and untouched by this brief.
- Do NOT touch `handleSpawningNewBalls`, the wave-of-30 gating logic, or the `spawnedCount.current`/`containerInstance.timeline.play(0)` wave-restart logic — none of that is related to the completion-detection duplication. It stays exactly as-is.
- Do NOT touch `handleClickRemove` or any of the click-to-pop flow.
- Do NOT land this brief before briefs 15 and 16 are confirmed working — this cleanup assumes `onComplete` is now reliable, which depends on both of those.

## WRONG (current code — `src/components/Spiral/SpiralPage.jsx`)

```jsx
// Auto-spawn: spawn a wave of 30 balls, then pause (using native requestAnimationFrame)
useEffect(() => {
  if (!isLoaded || !containerInstance) return;

  let rafId;

  // unspawn: identify and remove balls that reach the black hole
  const checkAndUnspawnCompletedBalls = () => {
    ballInstancesMap.current.forEach((inst, id) => {
      if (inst.timeline.progress() >= 0.999) {
        handleAutoRemove(id, inst);
      }
    });
  };

  // spawn: launch new balls based on progress spacing
  const handleSpawningNewBalls = () => {
    if (spawnedCount.current < 30) {
      const lastId = ballCounter.current;
      const lastInstance = ballInstancesMap.current.get(lastId);
      if (
        !lastInstance ||
        lastInstance.timeline.progress() >= MIN_SPAWN_PROGRESS
      ) {
        addBall();
        spawnedCount.current += 1;
      }
    } else if (containerInstance.children.length === 0) {
      spawnedCount.current = 0;
      containerInstance.timeline.play(0);
    }
  };

  const tick = () => {
    checkAndUnspawnCompletedBalls();
    handleSpawningNewBalls();
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(rafId);
    ballInstancesMap.current.clear();
    spawnedCount.current = 0;
  };
}, [addBall, handleAutoRemove, isLoaded, containerInstance]);
```

## CORRECT

```jsx
// Auto-spawn: spawn a wave of 30 balls, then pause (using native requestAnimationFrame).
// Ball removal on completion is handled entirely by SpiralBall's onComplete callback
// (event-driven) — no polling needed here. See brief 17.
useEffect(() => {
  if (!isLoaded || !containerInstance) return;

  let rafId;

  // spawn: launch new balls based on progress spacing
  const handleSpawningNewBalls = () => {
    if (spawnedCount.current < 30) {
      const lastId = ballCounter.current;
      const lastInstance = ballInstancesMap.current.get(lastId);
      if (
        !lastInstance ||
        lastInstance.timeline.progress() >= MIN_SPAWN_PROGRESS
      ) {
        addBall();
        spawnedCount.current += 1;
      }
    } else if (containerInstance.children.length === 0) {
      spawnedCount.current = 0;
      containerInstance.timeline.play(0);
    }
  };

  const tick = () => {
    handleSpawningNewBalls();
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(rafId);
    ballInstancesMap.current.clear();
    spawnedCount.current = 0;
  };
}, [addBall, isLoaded, containerInstance]);
```

Note the dependency array also drops `handleAutoRemove` — it's no longer referenced inside this particular `useEffect`'s closure once the polling function is gone (it's still used elsewhere, in the JSX passed to `<SpiralBall onAutoRemove={handleAutoRemove} />` — that reference is untouched).

## Verification checklist

```bash
git clone --branch v3 https://github.com/chahyasantoso/motionpath.git /tmp/verify17
cd /tmp/verify17

# 1. Polling function must be completely gone
grep -n "checkAndUnspawnCompletedBalls" src/components/Spiral/SpiralPage.jsx
# expect: NO output

# 2. handleAutoRemove must still exist and still be passed to SpiralBall
grep -n "handleAutoRemove" src/components/Spiral/SpiralPage.jsx
# expect: at least 2 hits — its definition, and onAutoRemove={handleAutoRemove} in the JSX.
# It must NOT appear in the useEffect dependency array for the spawn-loop effect.

# 3. The spawn-loop useEffect's dependency array no longer lists handleAutoRemove
grep -n "}, \[addBall, isLoaded, containerInstance\]);" src/components/Spiral/SpiralPage.jsx
# expect: 1 hit

# 4. Full suite still green (no unit tests target this JSX directly, but confirm nothing else broke)
npm install
npx vitest run
# expect: all test files passing
```

**Manual check in the browser (this is the part automated checks can't confirm):** load `/spiral`, let a full wave of 30 spawn and drain into the black hole, and confirm every ball still visibly disappears at the black hole — none linger, none get stuck. Then click-pop a handful of balls mid-flight and confirm the reflow still closes gaps cleanly with no leftover gap in newly-spawned balls (the brief 16 fix).
