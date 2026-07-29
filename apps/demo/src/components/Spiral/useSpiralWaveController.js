import { useCallback, useEffect, useRef, useState } from "react";
import { engine } from "@motionpath/core/engines/Engine";
import { gsapTickerClock } from "@motionpath/core/lib/gsapTickerClock.js";
import { Overlay } from "@motionpath/core/usecases/Overlay.js";
import { Spawner } from "@motionpath/core/usecases/Spawner.js";
import { createBallVm } from "./createBallVm.js";
import { BALL_COLORS } from "./spiralConfig.js";
import {
  BALL_TRAVEL_SECONDS,
  MIN_SPAWN_PROGRESS,
  SPAWN_INTERVAL_MS,
} from "./spiralPath.js";

const WAVE_SIZE = 30;
const GROUP_HOST_OPTIONS = {
  staggerTransition: { duration: 0.55, ease: "power2.out" },
  autoplay: true,
};

export function useSpiralWaveController({ isLoaded }) {
  const [ballVms, setBallVms] = useState([]);
  const [hostTrack, setHostTrack] = useState(null);
  const ballVmsRef = useRef([]);
  const ballCounterRef = useRef(0);
  const spawnerRef = useRef(null);

  const getBallVm = useCallback(
    (ballId) => ballVmsRef.current.find((ball) => ball.id === ballId) ?? null,
    [],
  );
  const updateBallVm = useCallback((ballId, patch) => {
    ballVmsRef.current = ballVmsRef.current.map((ball) =>
      ball.id === ballId ? { ...ball, ...patch } : ball,
    );
    setBallVms([...ballVmsRef.current]);
  }, []);
  const removeBallVm = useCallback((ballId) => {
    ballVmsRef.current = ballVmsRef.current.filter(
      (ball) => ball.id !== ballId,
    );
    setBallVms([...ballVmsRef.current]);
  }, []);

  const disposeOverlay = useCallback((vm) => {
    if (!vm?.overlay) return;
    vm.overlay.destroy();
    if (vm.overlayTrack) engine.unmount(vm.overlayTrack);
    vm.overlay = null;
    vm.overlayTrack = null;
  }, []);

  const startExit = useCallback(
    (ballId) => {
      const current = getBallVm(ballId);
      if (!current || current.status === "exiting") return;
      disposeOverlay(current);
      const exitTrack = engine.createTrackInstance("ball-exit-track", {
        id: `exit-${ballId}`,
        duration: 0.35,
      });
      const overlay = new Overlay().attach(
        current.ballTrack,
        exitTrack,
        (patch) => ({ scale: patch.scale, opacity: patch.opacity }),
      );
      current.overlay = overlay;
      current.overlayTrack = exitTrack;
      updateBallVm(ballId, { status: "exiting", isClickable: false });
      overlay
        .play()
        .then(() => {
          disposeOverlay(current);
          const latest = getBallVm(ballId);
          if (!latest) return;
          hostTrack?.removeChild(latest.ballTrack.id);
          spawnerRef.current?.notifyRemoved(1);
          removeBallVm(ballId);
        })
        .catch(() => {});
    },
    [disposeOverlay, getBallVm, hostTrack, removeBallVm, updateBallVm],
  );

  const startEntrance = useCallback(
    (ballId) => {
      const current = getBallVm(ballId);
      if (!current) return;
      disposeOverlay(current);
      const entranceTrack = engine.createTrackInstance("ball-entrance-track", {
        id: `entrance-${ballId}`,
        duration: 0.35,
      });
      const overlay = new Overlay().attach(
        current.ballTrack,
        entranceTrack,
        (patch) => ({ scale: patch.scale, opacity: patch.opacity }),
      );
      current.overlay = overlay;
      current.overlayTrack = entranceTrack;
      updateBallVm(ballId, { status: "spawning", isClickable: false });
      overlay
        .play()
        .then(() => {
          const latest = getBallVm(ballId);
          if (!latest || latest.status !== "spawning") return;
          disposeOverlay(latest);
          updateBallVm(ballId, { status: "active", isClickable: true });
        })
        .catch(() => {});
    },
    [disposeOverlay, getBallVm, updateBallVm],
  );

  const spawnBall = useCallback(() => {
    if (!hostTrack) return null;
    const id = ++ballCounterRef.current;
    const color = BALL_COLORS[id % BALL_COLORS.length];
    const ballTrack = engine.createTrackInstance("ball-track", {
      id: `ball-track-${id}`,
      duration: BALL_TRAVEL_SECONDS,
    });
    const vm = createBallVm({ id, color, ballTrack });
    vm.onClick = () => startExit(id);
    ballVmsRef.current = [...ballVmsRef.current, vm];
    setBallVms([...ballVmsRef.current]);
    hostTrack.addChild(ballTrack, { stagger: SPAWN_INTERVAL_MS / 1000 });
    startEntrance(id);
    const unsub = ballTrack.subscribe((snapshot) => {
      if (snapshot.progress >= 1) {
        unsub();
        const current = getBallVm(id);
        if (current?.status === "active") startExit(id);
      }
    });
    return vm;
  }, [getBallVm, hostTrack, startEntrance, startExit]);

  useEffect(() => {
    if (!isLoaded) return undefined;
    const host = engine.createGroupHost({
      id: `spiral-parent-${Date.now()}`,
      ...GROUP_HOST_OPTIONS,
    });
    setHostTrack(host);
    return () => {
      engine.unmount(host);
      setHostTrack(null);
    };
  }, [isLoaded]);

  useEffect(() => {
    if (!hostTrack) return undefined;
    const spawner = new Spawner({
      clock: gsapTickerClock,
      interval: 0,
      maxAlive: WAVE_SIZE,
      waveSize: WAVE_SIZE,
      canSpawn: () => {
        const last = ballVmsRef.current.at(-1);
        return !last || last.ballTrack.progress() >= MIN_SPAWN_PROGRESS;
      },
      factory: () => spawnBall(),
      onComplete: () => {
        if (hostTrack.childCount === 0) {
          spawner.resetWave();
          hostTrack.seek(0);
          hostTrack.play();
          spawner.start();
        }
      },
    });
    spawnerRef.current = spawner;
    spawner.start();
    return () => {
      spawner.destroy();
      spawnerRef.current = null;
      for (const vm of ballVmsRef.current) {
        disposeOverlay(vm);
        hostTrack.removeChild(vm.ballTrack.id);
        engine.unmount(vm.ballTrack);
      }
      ballVmsRef.current = [];
      setBallVms([]);
    };
  }, [disposeOverlay, hostTrack, isLoaded, spawnBall]);

  return { ballVms };
}
