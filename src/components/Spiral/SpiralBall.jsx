import { useCallback, useRef } from 'react';
import useMotionSubscribers from '../../hooks/useMotionSubscribers';

export default function SpiralBall({ vm }) {
  const ref = useRef(null);

  const sources = [
    { instance: vm.baseInstance, trackId: 'ball-track' },
    ...(vm.activeInstance !== vm.baseInstance
      ? [{ instance: vm.activeInstance, trackId: vm.activeTrackId }]
      : [])
  ];

  const mergeFn = useCallback((frames) => {
    const base = frames[0];
    const transition = frames[1]; // undefined when not in a spawn/exit transition

    const p = base.raw?.pathProgress ?? 0;

    if (!transition && (p <= 0 || p >= 1)) {
      return { display: 'none', opacity: 0 };
    }

    if (transition) {
      return { ...base.patch, ...transition.patch, display: 'flex' };
    }

    return { ...base.patch, display: 'flex' };
  }, []);

  useMotionSubscribers(sources, ref, mergeFn);

  return (
    <div
      ref={ref}
      className="element spiral-ball"
      onClick={vm.isClickable ? vm.onClick : undefined}
      style={{ '--ball-color': vm.color }}
    />
  );
}
