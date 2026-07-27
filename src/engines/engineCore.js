/**
 * @deprecated v4 does not use a separate EngineCore ticker. Motion delegates
 * own their GSAP timelines and Tracks notify their subscribers directly.
 *
 * Kept as a tiny compatibility shim for imports from unfinished experiments;
 * it creates no ticker and never references the removed MotionInstance type.
 */
export function createEngineCore() {
  return {
    registerActiveInstance() {},
    unregisterActiveInstance() {},
    destroy() {},
  };
}
