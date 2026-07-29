import { useEffect, useRef, useState } from "react";
import { engine } from "../../../../packages/core/src/engines/Engine.js";
export default function useMotionProject(project) {
  const [isLoaded, setIsLoaded] = useState(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    if (!projectRef.current) return;
    let cancelled = false;
    setIsLoaded(false);
    engine.loadProject(projectRef.current).then(() => { if (!cancelled) setIsLoaded(true); }).catch((err) => { if (!cancelled) console.error("[useMotionProject] loadProject failed:", err); });
    return () => { cancelled = true; engine.destroy(); };
  }, [project]);
  return isLoaded;
}
