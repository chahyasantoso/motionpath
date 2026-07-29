/**
 * @class LayoutDelegate
 *
 * Contract for pluggable child-placement policy on Track composition
 * (addChild/removeChild). Implementations decide WHERE a new child goes
 * (computeSpawnOffset) and WHETHER/HOW removal triggers a reflow of
 * surviving siblings (computeReflow). Track owns the mechanics (private
 * offset fields, GSAP nesting via the host Motion) — the delegate only
 * returns numbers/plans, it never touches a timeline or a Track's private
 * state directly.
 *
 * Implementations may be stateless (safe to share one instance across
 * every Track — see defaultGaplessLayoutDelegate) or stateful (e.g. a
 * hypothetical slot-pooling delegate tracking freed positions for reuse).
 * Stateful implementations must be constructed per-parent-track, never
 * shared — computeReflow is not guaranteed to be side-effect-free.
 */
export class LayoutDelegate {
  /**
   * @param {Track[]} children - live children BEFORE the new one is added
   * @param {{ stagger: number }} context
   * @returns {number} offset for the new child
   */
  computeSpawnOffset(children, context) {
    throw new Error("LayoutDelegate.computeSpawnOffset not implemented");
  }

  /**
   * @param {Track[]} children - live children INCLUDING removedChild (pre-splice)
   * @param {Track} removedChild
   * @param {{ stagger: number }} context
   * @returns {{ child: Track, offset: number }[]} reflow targets, [] if none
   */
  computeReflow(children, removedChild, context) {
    throw new Error("LayoutDelegate.computeReflow not implemented");
  }
}
