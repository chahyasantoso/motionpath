import { useEffect, useRef, useState } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * React Hook to load a complete MotionPath project once.
 * Replaces the entire previous state of the productionEngine upon mount.
 * Destroys and cleans up engine resources on unmount.
 *
 * @param {Object} project - The complete project schema object
 * @param {Object} [options]
 * @param {Object} [options.initialPlayStates] - Map of timelineId → boolean,
 *   applied once at load time only (prevents a one-frame flash of motion
 *   before a separate useMotionTimelinePlayback pause can land). Changing
 *   this after mount has no effect — use useMotionTimelinePlayback for
 *   ongoing control.
 * @returns {boolean} True once the project has successfully loaded
 */
export default function useMotionProject(project, { initialPlayStates = {} } = {}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const initialPlayStatesRef = useRef(initialPlayStates);
  initialPlayStatesRef.current = initialPlayStates;

  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;
    setIsLoaded(false);

    productionEngine
      .loadProject(projectRef.current, { playStates: initialPlayStatesRef.current })
      .then(() => {
        if (!cancelled) setIsLoaded(true);
      })
      .catch(err => {
        if (!cancelled) console.error('[useMotionProject] loadProject failed:', err);
      });

    return () => {
      cancelled = true;
      productionEngine.destroy();
    };
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  return isLoaded;
}

