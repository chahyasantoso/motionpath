import { useCallback } from 'react';
import useMotionInstance from './useMotionInstance.js';

/**
 * Mounts a manual-trigger motion (no autonomous clock — caller drives
 * progress directly, e.g. a RAF game loop or an imperative scrub control).
 *
 * @param {string|null} motionId
 * @param {Object} [config]
 * @returns {{ instance: Object|null, seek: (p: number) => void }}
 */
export default function useManualMotion(motionId, config) {
  const instance = useMotionInstance(motionId, config);
  const seek = useCallback((p) => {
    instance?.trigger?.progress(p);
  }, [instance]);
  return { instance, seek };
}
