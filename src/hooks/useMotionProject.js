import { useEffect, useRef } from 'react';
import { productionEngine } from '../lib/ProductionEngine';

/**
 * React Hook to load a complete MotionPath project once.
 * Replaces the entire previous state of the productionEngine upon mount.
 * Destroys and cleans up engine resources on unmount.
 *
 * @param {Object} project - The complete project schema object
 */
export default function useMotionProject(project) {
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;

    productionEngine.loadProject(projectRef.current).catch(err => {
      if (!cancelled) console.error('[useMotionProject] loadProject failed:', err);
    });

    return () => {
      cancelled = true;
      productionEngine.destroy();
    };
  }, [project]);
}
