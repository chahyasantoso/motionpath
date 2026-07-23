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
      if (typeof instance.play === 'function') {
        instance.play();
      } else if (instance.trigger && typeof instance.trigger.play === 'function') {
        instance.trigger.play();
      }
    } else {
      if (typeof instance.pause === 'function') {
        instance.pause();
      } else if (instance.trigger && typeof instance.trigger.pause === 'function') {
        instance.trigger.pause();
      }
    }
  }, [instance, playing]);
}
