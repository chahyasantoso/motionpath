import { useEffect } from 'react';

/**
 * Ongoing play/pause control for a MotionInstance or Motion.
 *
 * @param {object} instance
 * @param {boolean} playing
 */
export default function useMotionTimelinePlayback(instance, playing) {
  useEffect(() => {
    if (!instance) return;
    if (playing) {
      instance.play?.();
    } else {
      instance.pause?.();
    }
  }, [instance, playing]);
}
