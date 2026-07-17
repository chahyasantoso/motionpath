import useMotionSubscribers from './useMotionSubscribers.js';

/**
 * Smart Subscriber Hook — Listens to coordinate broadcasts from a MotionInstance
 * and applies them directly to a DOM element via domRenderer, bypassing
 * React's Virtual DOM entirely (Zero Re-render).
 *
 * A thin single-source wrapper over useMotionSubscribers — see that hook for
 * the underlying implementation and multi-source composition.
 *
 * @param {MotionInstance} instance - The active MotionInstance object
 * @param {string} trackId - ID of the track to subscribe to (matches tracks[].id in motion JSON)
 * @param {React.RefObject} ref - React ref to the target DOM element
 * @param {Function} [transformFn] - Optional transform function. Receives data (rawData)
 *   and compose function (rawData => patch) and must return an object of CSS properties for domRenderer.
 */
export default function useMotionSubscriber(instance, trackId, ref, transformFn) {
  useMotionSubscribers([{ instance, trackId, transformFn }], ref);
}
