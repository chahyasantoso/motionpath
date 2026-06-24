import { useEffect, useRef } from 'react';
import motionEngine from '../lib/motionEngine';

/**
 * Headless Initializer Hook — Initializes a motion scene on the engine.
 * Does not render anything. Handles cleanup via destroyScene on unmount
 * or when sceneData changes.
 *
 * @param {Object} sceneData - JSON scene object following schema.md
 * @param {React.RefObject} containerRef - React ref to the DOM container (needed by ScrollTrigger)
 */
export default function useMotionPlayer(sceneData, containerRef, options = {}) {
  const { paused = false } = options;
  // Store containerRef in a ref to keep it out of the dependency array.
  // React refs are stable objects — their .current may change but the ref itself doesn't.
  const containerRefStable = useRef(containerRef);
  containerRefStable.current = containerRef;

  useEffect(() => {
    if (!sceneData || !sceneData.sceneId) {
      return;
    }

    // Resolve the actual DOM element from the ref
    const containerEl = containerRefStable.current?.current ?? containerRefStable.current;

    motionEngine.initScene(sceneData, containerEl);

    // If initially paused, apply immediately
    if (paused) {
      if (sceneData.triggerType === 'scroll') {
        motionEngine.disableScroll(sceneData.sceneId);
      } else if (sceneData.triggerType === 'timer') {
        motionEngine.pauseTimer(sceneData.sceneId);
      }
    }

    // Cleanup: destroyScene handles kill timeline, kill tweens,
    // kill ScrollTrigger, and clear cache (motionEngine.js:244-272)
    return () => {
      motionEngine.destroyScene(sceneData.sceneId);
    };
  }, [sceneData]);

  // Handle play/pause toggle dynamically without destroying/recreating the scene
  useEffect(() => {
    if (!sceneData || !sceneData.sceneId) {
      return;
    }

    const { triggerType, sceneId } = sceneData;

    if (triggerType === 'scroll') {
      if (paused) {
        motionEngine.disableScroll(sceneId);
      } else {
        motionEngine.enableScroll(sceneId);
      }
    } else if (triggerType === 'timer') {
      if (paused) {
        motionEngine.pauseTimer(sceneId);
      } else {
        motionEngine.playTimer(sceneId);
      }
    }
  }, [sceneData?.sceneId, sceneData?.triggerType, paused]);
}
