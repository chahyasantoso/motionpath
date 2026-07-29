import { useCallback } from "react";
import useMotionInstance from "./useMotionInstance.js";

export default function useManualMotion(motionId, config) {
  const instance = useMotionInstance(motionId, config);
  const seek = useCallback(
    (p) => {
      instance?.seek?.(p);
    },
    [instance],
  );
  return { instance, seek };
}
