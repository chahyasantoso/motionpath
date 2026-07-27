import useMotionInstance from "./useMotionInstance.js";

/**
 * Mounts a time-triggered motion. TimeTriggerDelegate needs no DOM refs at
 * all, so this is a thin wrapper around useMotionInstance — it exists mainly
 * so call sites read consistently alongside useScrollMotion/useManualMotion,
 * without a future reader having to already know time motions happen to need
 * no refs.
 *
 * @param {string|null} motionId
 * @param {Object} [config]
 * @returns {{ instance: Object|null }}
 */
export default function useTimeMotion(motionId, config) {
  const instance = useMotionInstance(motionId, config);
  return { instance };
}
