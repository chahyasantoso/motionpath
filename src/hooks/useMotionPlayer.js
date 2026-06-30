import { useEffect, useRef } from 'react';
import motionEngine from '../lib/motionEngine';

/**
 * Headless Initializer Hook — Initializes a single motion scenario on the engine.
 * Does not render anything. Handles cleanup via destroyScene on unmount
 * or when scenario changes.
 *
 * @param {Object} scenario - JSON scenario object following schema
 * @param {React.RefObject} containerRef - React ref to the DOM container (needed by ScrollTrigger)
 * @param {{ paused?: boolean }} [options]
 */
export default function useMotionPlayer(scenario, containerRef, options = {}) {
  const { paused = false } = options;
  const containerRefStable = useRef(containerRef);
  containerRefStable.current = containerRef;

  useEffect(() => {
    if (!scenario || !scenario.sceneId) {
      return;
    }

    const containerEl = containerRefStable.current?.current ?? containerRefStable.current;
    motionEngine.initScene(scenario, containerEl);

    return () => {
      motionEngine.destroyScene(scenario.sceneId);
    };
  }, [scenario]);

  useEffect(() => {
    if (!scenario || !scenario.sceneId) {
      return;
    }

    if (paused) {
      motionEngine.pause(scenario.sceneId);
    } else {
      motionEngine.play(scenario.sceneId);
    }
  }, [scenario?.sceneId, paused]);
}
