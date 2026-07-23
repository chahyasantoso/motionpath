/**
 * @class LayoutDelegate
 *
 * Contract for pluggable child-placement policy on MotionInstance
 * composition (addChild/removeChild). Implementations decide WHERE a new
 * child goes (computeSpawnDelay) and WHETHER/HOW removal triggers a reflow
 * of surviving siblings (computeReflow). MotionInstance owns the mechanics
 * (GSAP nesting, tween execution via #reflowSiblings, teardown) — the
 * delegate only returns numbers/plans, it never touches a timeline.
 *
 * Implementations may be stateless (safe to share one instance across every
 * MotionInstance — see defaultGaplessLayoutDelegate) or stateful (e.g. a
 * hypothetical slot-pooling delegate tracking freed positions for reuse).
 * Stateful implementations must be constructed per-parent-instance, never
 * shared — computeReflow is not guaranteed to be side-effect-free.
 */
export class LayoutDelegate {
  /**
   * @param {MotionInstance[]} children - live children BEFORE the new one is added
   * @param {{ stagger: number, schemaMotion: object }} context
   * @returns {number} delay for the new child
   */
  computeSpawnDelay(children, context) {
    throw new Error('LayoutDelegate.computeSpawnDelay not implemented');
  }

  /**
   * @param {MotionInstance[]} children - live children INCLUDING removedChild (pre-splice)
   * @param {MotionInstance} removedChild
   * @param {{ stagger: number, schemaMotion: object }} context
   * @returns {{ child: MotionInstance, delay: number }[]} reflow targets, [] if none
   */
  computeReflow(children, removedChild, context) {
    throw new Error('LayoutDelegate.computeReflow not implemented');
  }
}
