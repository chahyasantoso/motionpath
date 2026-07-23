import { useCallback, useRef } from 'react';
import useMotionSubscribers from '../../hooks/useMotionSubscribers';

export function transformTransition(basePatch, transitionPatch) {
  return { ...basePatch, ...transitionPatch, display: 'flex' };
}

export default function SpiralBall({ vm }) {
  const ref = useRef(null);

  const baseSource = {
    instance: vm.baseInstance,
    trackId: 'ball-track',
    transformFn: (rawData, compose) => {
      const p = rawData?.pathProgress ?? 0;
      if (p <= 0 || p >= 1) return { display: 'none', opacity: 0 };
      return { ...compose(rawData), display: 'flex' };
    }
  };

  const sources = vm.activeInstance !== vm.baseInstance
    ? [baseSource, { instance: vm.activeInstance, trackId: vm.activeTrackId }]
    : [baseSource];

  const mergeFn = useCallback((patches) => {
    if (patches.length === 2) return transformTransition(patches[0], patches[1]);
    return patches[0];
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
