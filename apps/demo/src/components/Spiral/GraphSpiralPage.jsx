import { useMemo } from "react";
import useMotionProject from "@motionpath/react/useMotionProject";
import useSmoothScroll from "@motionpath/react/useSmoothScroll";
import { buildMotionPath } from "@motionpath/core/math/pathUtils.js";
import GraphSpiralBall from "./GraphSpiralBall.jsx";
import { BALL_SIZE, SPIRAL_CONFIG } from "./spiralConfig.js";
import { createGraphSpiralProject } from "./graphSpiralMotions.js";
import { spiralPathPoints, BALL_TRAVEL_SECONDS } from "./spiralPath.js";
import { useGraphSpiralController } from "./useGraphSpiralController.js";
import "./SpiralPage.css";

export default function GraphSpiralPage() {
  const project = useMemo(
    () => createGraphSpiralProject({ spiralPathPoints, ballSize: BALL_SIZE, ballTravelSeconds: BALL_TRAVEL_SECONDS }),
    [],
  );
  const isLoaded = useMotionProject(project);
  useSmoothScroll();
  const { ballVms } = useGraphSpiralController({ isLoaded });
  return (
    <div className="app zuma-app">
      <header className="header zuma-header">
        <h1>Zuma <span className="spiral-accent">Graph Flow</span></h1>
        <p className="subtitle">GraphPublisher • Explicit Overlay Dependencies • Native Reflow</p>
      </header>
      <section className="spiral-scene">
        <div className="scene-label">
          <h2>Endless Spiral <span className="spiral-accent">· Graph Flow</span></h2>
          <p>Same Zuma behavior, with each ball's path and transition overlays published through an explicit graph.</p>
        </div>
        <div className="spiral-stage">
          <svg className="path-guide" width="100%" height="100%" aria-hidden="true">
            <path d={buildMotionPath(spiralPathPoints)} fill="none" stroke="rgba(124, 92, 255, 0.3)" strokeWidth="2" strokeDasharray="8 6" />
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={90} fill="#000" />
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={28} fill="#000" />
          </svg>
          {ballVms.map((ball) => <GraphSpiralBall key={ball.id} vm={ball} />)}
        </div>
      </section>
      <footer className="footer zuma-footer"><p>© 2026 MotionPath Graph Spiral Demo</p></footer>
    </div>
  );
}
