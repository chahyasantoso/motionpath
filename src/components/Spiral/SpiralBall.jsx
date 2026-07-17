import { useCallback, useRef } from 'react';
import useMotionSubscribers from '../../hooks/useMotionSubscribers';

export function transformActive(basePatch) {
  const p = basePatch?.pathProgress ?? 0;
  if (p <= 0 || p >= 1) {
    return { display: 'none', opacity: 0 };
  }
  return { ...basePatch, display: 'flex' };
}

export function transformTransition(basePatch, transitionPatch) {
  return {
    ...basePatch,
    ...transitionPatch,
    display: 'flex'
  };
}

export default function SpiralBall({ vm }) {
  const ref = useRef(null);

  const sources = [
    { instance: vm.baseInstance, trackId: 'ball-track' },
    ...(vm.activeInstance !== vm.baseInstance ? [{ instance: vm.activeInstance, trackId: vm.activeTrackId }] : [])
  ];

  const mergeFn = useCallback((patches) => {
    if (patches.length === 2) {
      return transformTransition(patches[0], patches[1]);
    }
    return transformActive(patches[0]);
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
