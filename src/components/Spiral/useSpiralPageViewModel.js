import { useSpiralWaveController } from "./useSpiralWaveController.js";
import { spiralPathPoints } from "./spiralPath.js";

export function useSpiralPageViewModel({ isLoaded }) {
  const { ballVms } = useSpiralWaveController({ isLoaded });

  return {
    balls: ballVms,
    spiralPathPoints,
    title: "Zuma Spiral Flow",
    subtitle: "Time-Driven Physics • Engine Group Host • Native Reflow",
  };
}
