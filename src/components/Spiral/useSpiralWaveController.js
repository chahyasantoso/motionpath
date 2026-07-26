import { useCallback, useEffect, useRef, useState } from 'react';
import { engine } from '../../engines/Engine.js';
import { createTrack } from '../../lib/createTrack.js';
import { createBallVm } from './createBallVm.js';
import { BALL_COLORS } from './spiralConfig.js';
import {
  MIN_SPAWN_PROGRESS,
  BALL_TRAVEL_SECONDS,
  SPAWN_INTERVAL_MS
} from './spiralPath.js';
import { eventBus } from '../../lib/helpers.js';
import { gsap } from 'gsap';

export function useSpiralWaveController({ isLoaded, containerInstance }) {
  const [ballVms, setBallVms] = useState([]);
  const ballVmsRef = useRef([]);
  const ballCounterRef = useRef(0);
  const spawnedCountRef = useRef(0);
  const rafIdRef = useRef(null);

  // Child-change listener — fires whenever a ball is added or fully removed
  useEffect(() => {
    if (!containerInstance) return;
    const parentTrack = containerInstance.getTrack('keepalive');
    if (!parentTrack) return;

    const onSpawn = (payload) => {
      if (payload.parentId !== parentTrack.id) return;
      const alive = parentTrack.childCount;
      console.log('[wave] child change | alive balls:', alive, '| vms:', ballVmsRef.current.length);
    };
    const onRemove = (payload) => {
      if (payload.parentId !== parentTrack.id) return;
      const alive = parentTrack.childCount;
      console.log('[wave] child change | alive balls:', alive, '| vms:', ballVmsRef.current.length);
    };

    const unsubSpawn = eventBus.on('child:spawned', onSpawn);
    const unsubRemove = eventBus.on('child:removing', onRemove);
    return () => {
      unsubSpawn();
      unsubRemove();
    };
  }, [containerInstance]);

  const getBallVm = useCallback((ballId) => {
    return ballVmsRef.current.find(ball => ball.id === ballId) ?? null;
  }, []);

  const updateBallVm = useCallback((ballId, patch) => {
    ballVmsRef.current = ballVmsRef.current.map(ball =>
      ball.id === ballId ? { ...ball, ...patch } : ball
    );
    setBallVms(ballVmsRef.current);
  }, []);

  const removeBallVm = useCallback((ballId) => {
    ballVmsRef.current = ballVmsRef.current.filter(ball => ball.id !== ballId);
    setBallVms(ballVmsRef.current);
  }, []);

  const startExit = useCallback((ballId) => {
    const current = getBallVm(ballId);
    if (!current) return;
    if (current.status === 'exiting') return;

    // Stamp an independent exit overlay from the loaded schema
    // (createSpiralTransitionScene → 'ball-exit-track'). Definition lives in
    // spiralMotions.js; only the id is made unique per ball. See
    // feature-swarm-design.md §"Part A′: Track-direct swarm".
    const exitConfig = engine.getTrackConfig('ball-exit-track');
    if (!exitConfig) return;
    const exitTrack = createTrack(
      { ...exitConfig, id: `exit-${ballId}`, duration: 0.35 },
      engine.templates
    );

    // Clear ALL observations first so a still-active entrance overlay (fast click
    // during entrance) is hard-replaced immediately — exit is the sole overlay.
    current.ballTrack.setObserved(null);
    current.ballTrack.setObserved(
      exitTrack,
      (patch) => ({ scale: patch.scale, opacity: patch.opacity })
    );

    updateBallVm(ballId, { status: 'exiting', isClickable: false });

    gsap.to(exitTrack, {
      progress: 1,
      duration: 0.35,
      ease: 'none',
      onComplete: () => {
        exitTrack.destroy();
        const latest = getBallVm(ballId);
        if (!latest) return;

        const parentTrack = containerInstance?.getTrack('keepalive');
        const aliveAfter = parentTrack ? parentTrack.childCount - 1 : 0;
        const willRespawn = spawnedCountRef.current >= 30 && aliveAfter === 0;
        console.log(`[wave] remove ball #${ballId} | alive after: ${aliveAfter} | wave respawn: ${willRespawn}`);

        parentTrack?.removeChild(latest.ballTrack.id);
        removeBallVm(ballId);
      }
    });
  }, [containerInstance, getBallVm, removeBallVm, updateBallVm]);

  const startEntrance = useCallback((ballId) => {
    const current = getBallVm(ballId);
    if (!current) return;

    // Stamp an independent entrance overlay from the loaded schema
    // (createSpiralTransitionScene → 'ball-entrance-track').
    const entranceConfig = engine.getTrackConfig('ball-entrance-track');
    if (!entranceConfig) return;
    const entranceTrack = createTrack(
      { ...entranceConfig, id: `entrance-${ballId}`, duration: 0.35 },
      engine.templates
    );

    // Fold entrance scale/opacity into the ball Track's compose output.
    current.ballTrack.setObserved(
      entranceTrack,
      (patch) => ({ scale: patch.scale, opacity: patch.opacity })
    );

    updateBallVm(ballId, { status: 'spawning', isClickable: false });

    gsap.to(entranceTrack, {
      progress: 1,
      duration: 0.35,
      ease: 'none',
      onComplete: () => {
        const latest = getBallVm(ballId);
        if (!latest) return;

        // Guard: a fast click during entrance may have already started the exit
        // (status 'exiting'), which cleared observations and folded the exit overlay.
        // In that case the entrance is stale — clean up its track but do NOT
        // touch observations (exit owns them now) and do NOT flip status back to active.
        if (latest.status !== 'spawning') {
          entranceTrack.destroy();
          return;
        }

        // MUST clear before destroy — ball Track survives, entranceTrack does not.
        latest.ballTrack.removeObserved(entranceTrack);
        entranceTrack.destroy();

        updateBallVm(ballId, { status: 'active', isClickable: true });
      }
    });
  }, [getBallVm, updateBallVm]);

  const spawnBall = useCallback(() => {
    if (!containerInstance) return;
    const parentTrack = containerInstance.getTrack('keepalive');
    if (!parentTrack) return;

    const id = ++ballCounterRef.current;
    const color = BALL_COLORS[id % BALL_COLORS.length];

    // Stamp an independent ball track from the loaded schema
    // (createSpiralBallScene → 'ball-track'). One definition, unique id per ball.
    const ballConfig = engine.getTrackConfig('ball-track');
    if (!ballConfig) return;
    const ballTrack = createTrack(
      { ...ballConfig, id: `ball-track-${id}`, duration: BALL_TRAVEL_SECONDS },
      engine.templates
    );
    console.log(`[wave] spawn ball #${id} | spawned total: ${spawnedCountRef.current + 1} | alive: ${parentTrack.childCount + 1}`);

    const vm = createBallVm({ id, color, ballTrack });
    vm.onClick = () => startExit(id);

    // Sync ref mirror synchronously so startEntrance can find it immediately
    ballVmsRef.current = [...ballVmsRef.current, vm];
    setBallVms(ballVmsRef.current);

    parentTrack.addChild(ballTrack, { stagger: SPAWN_INTERVAL_MS / 1000 });
    startEntrance(id);

    const unsub = ballTrack.subscribe((snapshot) => {
      if (snapshot.progress >= 1) {
        unsub();
        const current = getBallVm(id);
        if (current && current.status === 'active') {
          startExit(id);
        }
      }
    });
  }, [containerInstance, startEntrance, startExit, getBallVm]);

  // Wave spawn loop
  useEffect(() => {
    if (!isLoaded || !containerInstance) return;
    const parentTrack = containerInstance.getTrack('keepalive');
    if (!parentTrack) return;

    const tick = () => {
      if (spawnedCountRef.current < 30) {
        const lastBall = ballVmsRef.current[ballVmsRef.current.length - 1] ?? null;
        const lastTrack = lastBall?.ballTrack ?? null;

        if (!lastTrack || lastTrack.progress() >= MIN_SPAWN_PROGRESS) {
          spawnBall();
          spawnedCountRef.current += 1;
        }
      } else if (parentTrack.childCount === 0) {
        spawnedCountRef.current = 0;
        containerInstance.trigger.seek(0);
        containerInstance.trigger.play();
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      spawnedCountRef.current = 0;
    };
  }, [isLoaded, containerInstance, spawnBall]);

  return {
    ballVms,
  };
}
