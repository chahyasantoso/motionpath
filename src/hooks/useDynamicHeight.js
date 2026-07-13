import { useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Localized hook to scale a trigger element's height proportionally
 * to a MotionInstance's timeline duration.
 *
 * @param {MotionInstance|null} instance - The parent MotionInstance
 * @param {React.RefObject} triggerRef - Ref of the ScrollTrigger container
 */
export default function useDynamicHeight(instance, triggerRef) {
  useEffect(() => {
    if (!instance || !triggerRef.current) return undefined;

    const element = triggerRef.current;
    
    // Store original style to restore on cleanup
    const originalHeight = element.style.height;

    // Measure initial height and viewport bounds
    const initialHeight = element.offsetHeight;
    const viewportHeight = window.innerHeight;
    const initialDuration = instance.timeline.duration() || 1.0;
    
    const initialScrollRange = initialHeight - viewportHeight;
    // Fallback if the trigger wrapper starts at <= viewport height
    const baseScrollRange = initialScrollRange > 0 ? initialScrollRange : 1000;
    const pixelsPerSecond = baseScrollRange / initialDuration;

    const updateHeight = () => {
      const currentDuration = instance.timeline.duration();
      const newHeight = (currentDuration * pixelsPerSecond) + viewportHeight;
      element.style.height = `${newHeight}px`;
    };

    // Listen for child additions/removals
    const unsubscribe = instance.onChildChange?.(() => {
      updateHeight();
    });

    // Initialize
    updateHeight();

    return () => {
      if (unsubscribe) unsubscribe();
      if (originalHeight) {
        element.style.height = originalHeight;
      } else {
        element.style.removeProperty('height');
      }
      ScrollTrigger.refresh();
    };
  }, [instance, triggerRef]);
}
