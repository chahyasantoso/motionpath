import { useEffect, useRef, useState } from "react";
import { engine } from "@motionpath/core/engines/Engine";

/**
 * React Hook to load a complete MotionPath project once.
 * Replaces the entire previous state of the engine upon mount.
 * Destroys and cleans up engine resources on unmount.
 *
 * @param {Object} project - The complete project schema object
 * @returns {boolean} True once the project has successfully loaded
 */
export default function useMotionProject(project) {
  const [isLoaded, setIsLoaded] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;
    setIsLoaded(false);

    engine
      .loadProject(projectRef.current)
      .then(() => {
        if (!cancelled) setIsLoaded(true);
      })
      .catch((err) => {
        if (!cancelled)
          console.error("[useMotionProject] loadProject failed:", err);
      });

    return () => {
      cancelled = true;
      engine.destroy();
    };
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  return isLoaded;
}
