import { useCallback, useEffect, useRef, useState } from "react";
import "./BurstPage.css";
import useMotionProject from "../../hooks/useMotionProject";
import useMotionSubscriber from "../../hooks/useMotionSubscriber";
import useScrollMotion from "../../hooks/useScrollMotion";
import { buildMotionPath } from "../../utils/pathUtils";
import { projectPathNodes3DTo2D } from "../../utils/projection3d";
import {
  STRAW_PERSPECTIVE,
  burstProject,
  iceCreamCardScene,
  strawberryScene,
} from "./burstMotions";

const STRAWBERRY_TRACKS = strawberryScene.tracks.filter((track) =>
  track.id.startsWith("strawberry"),
);

// ─── Strawberry Burst Demo Components ───────────────────────────
function Strawberry({ instance, trackId, emoji }) {
  const ref = useRef(null);

  // Stable random starting rotation angle between 0 and 360 degrees
  const startRotation = useRef(Math.floor(Math.random() * 360)).current;

  const transform = useCallback(
    (rawData, composeFn) => {
      // One compose per frame. The old version called composeFn twice and fed
      // `blur` back into raw data hoping the filter plugin would pick it up --
      // but plugins are resolved from a track's AUTHORED keyframe keys, and
      // these tracks only author path + opacity, so that pass was dead code.
      const composed = composeFn(rawData);
      const progress = rawData.pathProgress ?? 0;
      const z = composed.z ?? 0;

      let blur = 0;
      if (z < -100) {
        // Background blur (soft focus)
        blur = Math.min(3, (-z - 100) / 80);
      } else if (z > 50) {
        // Foreground lens blur (macro bokeh)
        blur = Math.min(8, (z - 50) / 20);
      }

      return {
        ...composed, // x, y, z, opacity, xPercent/yPercent anchor
        rotation: startRotation + progress * 90,
        filter: `blur(${Math.round(blur * 10) / 10}px)`,
      };
    },
    [startRotation],
  );

  useMotionSubscriber(instance, trackId, ref, transform);

  return (
    <div ref={ref} className="strawberry-element">
      {emoji}
    </div>
  );
}

function IceCreamCard({ instance }) {
  const ref = useRef(null);
  useMotionSubscriber(instance, "strawberry-card", ref);

  return (
    <div ref={ref} className="burst-card">
      <div className="badge">Limited Flavor</div>
      <h3>Strawberry Sundae</h3>
      <p>
        A double scoop of fresh strawberry and creamy vanilla ice cream, topped
        with rich syrup and juicy strawberry bursts.
      </p>
      <div
        className="growth-readout"
        style={{
          color: "#ff6bca",
          border: "1px solid rgba(255, 107, 202, 0.3)",
        }}
      >
        🍓 $4.99 SPECIAL
      </div>
    </div>
  );
}

function IceCreamCenterpiece({ instance }) {
  const ref = useRef(null);
  useMotionSubscriber(instance, "ice-cream-center", ref);

  return (
    <div ref={ref} className="ice-cream-wrapper">
      <div className="ice-cream-center-el">🍦</div>
    </div>
  );
}

export default function BurstPage() {
  // The scrubbed burst scene and the observer-driven card both key off the
  // SAME section element, and a DOM node can only carry one ref -- so the
  // page owns the refs and hands them to both hooks.
  const sceneRef = useRef(null);
  const stageRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(stage);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const isLoaded = useMotionProject(burstProject);

  const { instance: strawberryInstance } = useScrollMotion(
    isLoaded ? strawberryScene : null,
    { trigger: sceneRef, pin: stageRef },
  );
  const { instance: cardInstance } = useScrollMotion(
    isLoaded ? iceCreamCardScene : null,
    { trigger: sceneRef },
  );

  const strawCx = dimensions.width * 0.25;
  const strawCy = dimensions.height * 0.5;

  // Map 3D path nodes to 2D for the guide overlay (ice cream center excluded)
  const strawberryPaths = STRAWBERRY_TRACKS.map((track) => ({
    id: track.id,
    d: buildMotionPath(
      projectPathNodes3DTo2D(
        track.keyframes.path.points,
        strawCx,
        strawCy,
        0,
        false,
        STRAW_PERSPECTIVE,
      ),
    ),
  }));

  const cardNodes = iceCreamCardScene.tracks[0].keyframes.path.points;

  return (
    <div className="app">
      <header className="header">
        <h1>
          MotionPath <span className="accent">Burst Demo</span>
        </h1>
        <p className="subtitle">
          Staggered Timeframes • Native 3D Z-Depth Projection
        </p>
      </header>

      <section ref={sceneRef} className="burst-scene">
        <div ref={stageRef} className="burst-stage">
          <div className="scene-label">
            <h2>Multi-Scene Orchestration (Scroll Scrub + Scroll Observer)</h2>
            <p>
              Ten scroll-triggered strawberries burst sequentially using
              staggered timeframes, while a scroll-observer triggered card
              slides in autonomously when the stage enters viewport.
            </p>
          </div>

          <div
            className="burst-inner"
            style={{
              perspective: `${STRAW_PERSPECTIVE}px`,
              perspectiveOrigin: `${strawCx}px ${strawCy}px`,
            }}
          >
            <svg className="path-guide" width="100%" height="100%">
              {strawberryPaths.map((path) => (
                <path
                  key={path.id}
                  d={path.d}
                  fill="none"
                  stroke="rgba(255, 107, 202, 0.1)"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                />
              ))}
              <g
                transform={`translate(${dimensions.width * 0.72}, ${dimensions.height * 0.5})`}
              >
                <path
                  d={buildMotionPath(cardNodes)}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.05)"
                  strokeWidth="1"
                  strokeDasharray="8 6"
                />
              </g>
            </svg>

            {STRAWBERRY_TRACKS.map((track) => (
              <Strawberry
                key={track.id}
                instance={strawberryInstance}
                trackId={track.id}
                emoji="🍓"
              />
            ))}

            <IceCreamCenterpiece instance={strawberryInstance} />

            <IceCreamCard instance={cardInstance} />
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>Scroll down/up to trigger the burst effect</p>
      </footer>
    </div>
  );
}
