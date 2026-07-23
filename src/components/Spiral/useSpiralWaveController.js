import { useCallback, useEffect, useRef, useState } from 'react';
import { engine } from '../../engines/Engine.js';
import { createTrack } from '../../lib/createTrack.js';
import { createBallVm } from './createBallVm.js';
import { BALL_COLORS, BALL_SIZE } from './spiralConfig.js';
import {
  MIN_SPAWN_PROGRESS,
  spiralPathPoints,
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
      const alive = parentTrack.children.length;
      console.log('[wave] child change | alive balls:', alive, '| vms:', ballVmsRef.current.length);
    };
    const onRemove = (payload) => {
      if (payload.parentId !== parentTrack.id) return;
      const alive = parentTrack.children.length;
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

    createTrack({
      id: `exit-${ballId}`,
      keyframes: {
        scale:   { stops: [{ p: 0, v: 1 }, { p: 0.35, v: 1.7 }, { p: 1, v: 0 }] },
        opacity: { stops: [{ p: 0, v: 1 }, { p: 0.5,  v: 0.9 }, { p: 1, v: 0 }] },
        '--ball-size': {
          stops: [
            { p: 0, v: `${BALL_SIZE}px` },
            { p: 1, v: `${BALL_SIZE}px` }
          ]
        }
      },
      duration: 0.35
    }).then(exitTrack => {
      updateBallVm(ballId, {
        activeTrack: exitTrack,
        status: 'exiting',
        isClickable: false,
      });

      gsap.to(exitTrack, {
        progress: 1,
        duration: 0.35,
        ease: 'none',
        onComplete: () => {
          exitTrack.destroy();
          const latest = getBallVm(ballId);
          if (!latest) return;

          const parentTrack = containerInstance?.getTrack('keepalive');
          const aliveAfter = parentTrack ? parentTrack.children.length - 1 : 0;
          const willRespawn = spawnedCountRef.current >= 30 && aliveAfter === 0;
          console.log(`[wave] remove ball #${ballId} | alive after: ${aliveAfter} | wave respawn: ${willRespawn}`);

          parentTrack?.removeChild(latest.baseTrack.id);
          removeBallVm(ballId);
        }
      });
    });
  }, [containerInstance, getBallVm, removeBallVm, updateBallVm]);

  const startEntrance = useCallback((ballId) => {
    const current = getBallVm(ballId);
    if (!current) return;

    createTrack({
      id: `entrance-${ballId}`,
      keyframes: {
        scale:   { stops: [{ p: 0, v: 1 }, { p: 0.35, v: 1.7 }, { p: 1, v: 1 }] },
        opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
        '--ball-size': {
          stops: [
            { p: 0, v: `${BALL_SIZE}px` },
            { p: 1, v: `${BALL_SIZE}px` }
          ]
        }
      },
      duration: 0.35
    }).then(entranceTrack => {
      updateBallVm(ballId, {
        activeTrack: entranceTrack,
        status: 'spawning',
        isClickable: false,
      });

      gsap.to(entranceTrack, {
        progress: 1,
        duration: 0.35,
        ease: 'none',
        onComplete: () => {
          entranceTrack.destroy();
          const latest = getBallVm(ballId);
          if (!latest) return;

          updateBallVm(ballId, {
            activeTrack: latest.baseTrack,
            status: 'active',
            isClickable: true,
          });
        }
      });
    });
  }, [getBallVm, updateBallVm]);

  const spawnBall = useCallback(() => {
    if (!containerInstance) return;
    const parentTrack = containerInstance.getTrack('keepalive');
    if (!parentTrack) return;

    const id = ++ballCounterRef.current;
    const color = BALL_COLORS[id % BALL_COLORS.length];

    createTrack({
      id: `ball-track-${id}`,
      keyframes: {
        path: {
          points: spiralPathPoints,
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: 'none' }],
        },
        opacity: {
          stops: [
            { p: 0.0, v: 0 },
            { p: 0.05, v: 1 },
            { p: 0.88, v: 1 },
            { p: 1.0,  v: 0 },
          ],
        },
        '--ball-size': {
          stops: [
            { p: 0, v: `${BALL_SIZE}px` },
            { p: 1, v: `${BALL_SIZE}px` }
          ]
        }
      },
      duration: BALL_TRAVEL_SECONDS
    }).then(baseTrack => {
      console.log(`[wave] spawn ball #${id} | spawned total: ${spawnedCountRef.current + 1} | alive: ${parentTrack.children.length + 1}`);

      const vm = createBallVm({ id, color, baseTrack });
      vm.onClick = () => startExit(id);

      // Sync ref mirror synchronously so startEntrance can find it immediately
      ballVmsRef.current = [...ballVmsRef.current, vm];
      setBallVms(ballVmsRef.current);

      parentTrack.addChild(baseTrack, { stagger: SPAWN_INTERVAL_MS / 1000 });
      startEntrance(id);

      const unsub = baseTrack.subscribe((snapshot) => {
        if (snapshot.progress >= 1) {
          unsub();
          const current = getBallVm(id);
          if (current && current.status === 'active') {
            startExit(id);
          }
        }
      });
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
        const lastTrack = lastBall?.baseTrack ?? null;

        if (!lastTrack || lastTrack.progress() >= MIN_SPAWN_PROGRESS) {
          spawnBall();
          spawnedCountRef.current += 1;
        }
      } else if (parentTrack.children.length === 0) {
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
