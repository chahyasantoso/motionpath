import { useCallback, useEffect, useRef, useState } from 'react';
import { productionEngine } from '../../engines/ProductionEngine.js';
import { createBallVm } from './createBallVm.js';
import { BALL_COLORS } from './spiralConfig.js';
import { MIN_SPAWN_PROGRESS } from './spiralPath.js';

export function useSpiralWaveController({ isLoaded, containerInstance }) {
  const [ballVms, setBallVms] = useState([]);
  const ballVmsRef = useRef([]);
  const ballCounterRef = useRef(0);
  const spawnedCountRef = useRef(0);
  const rafIdRef = useRef(null);

  // Child-change listener — fires whenever a ball is added or fully removed
  useEffect(() => {
    if (!containerInstance) return;
    return containerInstance.onChildChange(() => {
      const alive = containerInstance.children.length;
      console.log('[wave] child change | alive balls:', alive, '| vms:', ballVmsRef.current.length);
    });
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

      const aliveAfter = containerInstance ? containerInstance.children.length - 1 : 0;
      const willRespawn = spawnedCountRef.current >= 30 && aliveAfter === 0;
      console.log(`[wave] remove ball #${ballId} | alive after: ${aliveAfter} | wave respawn: ${willRespawn}`);

      containerInstance?.removeChild(latest.baseInstance);
      removeBallVm(ballId);
    });
  }, [containerInstance, getBallVm, removeBallVm, updateBallVm]);

  const startEntrance = useCallback((ballId) => {
    const current = getBallVm(ballId);
    if (!current) return;

    const entranceInstance = productionEngine.mountInstance('ball-exit');
    if (!entranceInstance) {
      return;
    }

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
  }, [getBallVm, updateBallVm]);

  const spawnBall = useCallback(() => {
    if (!containerInstance) return;

    const baseInstance = containerInstance.addChild('spiral-zuma');
    if (!baseInstance) return;

    const id = ++ballCounterRef.current;
    const color = BALL_COLORS[id % BALL_COLORS.length];
    console.log(`[wave] spawn ball #${id} | spawned total: ${spawnedCountRef.current + 1} | alive: ${containerInstance.children.length}`);

    const vm = createBallVm({ id, color, baseInstance });
    vm.onClick = () => startExit(id);

    // Sync ref mirror synchronously so startEntrance can find it immediately
    ballVmsRef.current = [...ballVmsRef.current, vm];
    setBallVms(ballVmsRef.current);

    startEntrance(id);

    baseInstance.onComplete(() => {
      const current = getBallVm(id);
      if (!current) return;
      if (current.status !== 'active') return;
      startExit(id);
    });
  }, [containerInstance, startEntrance, startExit, getBallVm]);

  // Wave spawn loop
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
  }, [isLoaded, containerInstance, spawnBall]);

  return {
    ballVms,
  };
}
