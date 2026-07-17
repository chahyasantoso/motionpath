import { useCallback, useRef } from 'react';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';

export default function SpiralBall({ vm }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    if (vm.activeTrackId === 'ball-exit-track' || vm.activeTrackId === 'ball-entrance-track') {
      const currentParentSnapshot = vm.baseInstance.getCurrentSnapshot('ball-track');
      if (!currentParentSnapshot) return composeFn(rawData);

      const parentComposed = vm.baseInstance.compose('ball-track', currentParentSnapshot);
      const transitionData = composeFn(rawData);

      return {
        ...parentComposed,
        ...transitionData,
        display: 'flex',
      };
    }

    const p = rawData.pathProgress ?? 0;
    if (p <= 0 || p >= 1) {
      return { display: 'none', opacity: 0 };
    }

    const composed = composeFn(rawData);
    return { ...composed, display: 'flex' };
  }, [vm]);

  useMotionSubscriber(vm.activeInstance, vm.activeTrackId, ref, transform);

  return (
    <div
      ref={ref}
      className="element spiral-ball"
      onClick={vm.isClickable ? vm.onClick : undefined}
      style={{ '--ball-color': vm.color }}
    />
  );
}
