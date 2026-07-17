import { useSpiralWaveController } from './useSpiralWaveController.js';
import { spiralPathPoints } from './spiralPath.js';

export function useSpiralPageViewModel({ isLoaded, containerInstance }) {
  const { ballVms } = useSpiralWaveController({ isLoaded, containerInstance });

  return {
    balls: ballVms,
    spiralPathPoints,
    title: 'Zuma Spiral Flow',
    subtitle: 'Time-Driven Physics • Stagger Parent • Built-in Native Reflow',
  };
}
