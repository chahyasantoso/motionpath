import { useEffect, useRef } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * React Hook to load a complete MotionPath project once.
 * Replaces the entire previous state of the productionEngine upon mount.
 * Destroys and cleans up engine resources on unmount.
 *
 * @param {Object} project - The complete project schema object
 * @param {Object} [playStates] - Map of timelineId → boolean.
 *   false = start paused, true = start playing (default for unspecified ids).
 *   Changes to this object trigger play/pause without reloading the project.
 */
export default function useMotionProject(project, playStates = {}) {
  const projectRef = useRef(project);
  projectRef.current = project;

  // Stable string key for play state — avoids object reference churn as dep
  const playStatesKey = Object.entries(playStates)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(',');

  // Effect 1: Load — reruns only when the project schema changes
  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;

    productionEngine.loadProject(projectRef.current, { playStates }).catch(err => {
      if (!cancelled) console.error('[useMotionProject] loadProject failed:', err);
    });

    return () => {
      cancelled = true;
      productionEngine.destroy();
    };
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Play state — reruns only when playStates values change
  // Independent of the load effect; never triggers a project reload.
  useEffect(() => {
    for (const [id, playing] of Object.entries(playStates)) {
      try {
        if (playing) productionEngine.playTimer(id);
        else         productionEngine.pauseTimer(id);
      } catch {
        // Engine not yet ready — initial state is handled by loadProject options above
      }
    }
  }, [playStatesKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
