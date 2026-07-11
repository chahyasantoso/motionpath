import { useEffect } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * Ongoing play/pause control for a timelineId, independent of project
 * load/unload. Any component, at any depth, can control any timeline's
 * play state — not just the component that called useMotionProject.
 *
 * @param {string} timelineId
 * @param {boolean} playing
 */
export default function useMotionTimelinePlayback(timelineId, playing) {
  useEffect(() => {
    if (!timelineId) return;
    if (playing) productionEngine.playTimer(timelineId);
    else         productionEngine.pauseTimer(timelineId);
  }, [timelineId, playing]);
}
