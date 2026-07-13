import { useEffect } from 'react';

/**
 * Ongoing play/pause control for a MotionInstance.
 *
 * @param {MotionInstance} instance
 * @param {boolean} playing
 */
export default function useMotionTimelinePlayback(instance, playing) {
  useEffect(() => {
    if (!instance) return;
    if (playing) {
      if (typeof instance.play === 'function') {
        instance.play();
      }
    } else {
      if (typeof instance.pause === 'function') {
        instance.pause();
      }
    }
  }, [instance, playing]);
}
