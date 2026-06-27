import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import useMotionPlayer from './hooks/useMotionPlayer';
import useMotionSubscriber from './hooks/useMotionSubscriber';
import { buildMotionPath } from './lib/pathUtils';
import { projectPathNodes3DTo2D } from './lib/projection3d';

// ─── Strawberry Burst Demo Configs ──────────────────────────────
const STRAW_PERSPECTIVE = 800;

const strawberryScene = {
  sceneId: 'strawberry-burst-scroll',
  triggerType: 'scroll',
  scrollConfig: { scrub: 0.5, pin: '.burst-stage' },
  elements: [
    { id: 'strawberry-1', timeframe: [0.0, 0.45], pathNodes: [{ x: 0, y: 0, z: -1420 }, { x: -160, y: -120, z: 200 }] },
    { id: 'strawberry-2', timeframe: [0.0, 0.45], pathNodes: [{ x: 0, y: 0, z: -280 }, { x: 160, y: -120, z: 150 }] },
    { id: 'strawberry-3', timeframe: [0.15, 0.6], pathNodes: [{ x: 0, y: 0, z: -1350 }, { x: -40, y: 140, z: 250 }] },
    { id: 'strawberry-4', timeframe: [0.15, 0.6], pathNodes: [{ x: 0, y: 0, z: -1220 }, { x: -200, y: 30, z: 180 }] },
    { id: 'strawberry-5', timeframe: [0.3, 0.75], pathNodes: [{ x: 0, y: 0, z: -400 }, { x: 200, y: 60, z: 220 }] },
    { id: 'strawberry-6', timeframe: [0.3, 0.75], pathNodes: [{ x: 0, y: 0, z: -1310 }, { x: -100, y: -180, z: 120 }] },
    { id: 'strawberry-7', timeframe: [0.45, 0.9], pathNodes: [{ x: 0, y: 0, z: -450 }, { x: 100, y: -180, z: 240 }] },
    { id: 'strawberry-8', timeframe: [0.45, 0.9], pathNodes: [{ x: 0, y: 0, z: -1260 }, { x: 80, y: 160, z: 160 }] },
    { id: 'strawberry-9', timeframe: [0.6, 1.0], pathNodes: [{ x: 0, y: 0, z: -370 }, { x: -120, y: 100, z: 300 }] },
    { id: 'strawberry-10', timeframe: [0.6, 1.0], pathNodes: [{ x: 0, y: 0, z: -200 }, { x: 180, y: -50, z: 100 }] },
    {
      id: 'ice-cream-center',
      timeframe: [0.0, 0.7],
      pathNodes: [
        { x: 0, y: 0, z: 400 },
        { x: 0, y: -35, z: 0 } // Starts huge close to the screen, recedes to normal size at z = 0
      ]
    }
  ]
};

const iceCreamCardScene = {
  sceneId: 'ice-cream-card-slide',
  triggerType: 'timer',
  elements: [
    {
      id: 'strawberry-card',
      timeframe: [0.3, 1.0],
      pathNodes: [
        { x: 0, y: 300 },
        { x: 0, y: 0 }
      ],
      duration: 2.2,
      ease: 'power3.out',
      repeat: 0
    }
  ]
};

// ─── Strawberry Burst Demo Components ───────────────────────────
function Strawberry({ elementId, emoji }) {
  const ref = useRef(null);
  
  // Stable random starting rotation angle between 0 and 360 degrees
  const startRotation = useRef(Math.floor(Math.random() * 360)).current;

  const transform = useCallback((data) => {
    // Base random rotation + spin as it bursts
    const rotation = startRotation + (data.progress * 90);

    // Depth of Field (focal plane is near Z = 0)
    let blur = 0;
    if (data.z < -100) {
      // Background blur (soft focus)
      blur = Math.min(3, (-data.z - 100) / 80);
    } else if (data.z > 50) {
      // Foreground lens blur (macro bokeh)
      blur = Math.min(8, (data.z - 50) / 20);
    }

    // Fade in when starting, fade out when leaving timeframe
    let opacity = 1;
    if (data.progress < 0.15) {
      opacity = data.progress / 0.15;
    } else if (data.progress > 0.85) {
      opacity = (1 - data.progress) / 0.15;
    }

    return {
      x: data.x,
      y: data.y,
      z: data.z, // Scaled automatically by native 3D perspective projection
      rotation: rotation,
      filter: `blur(${Math.round(blur * 10) / 10}px)`,
      xPercent: -50,
      yPercent: -50,
      opacity: opacity,
    };
  }, [startRotation]);

  useMotionSubscriber(elementId, ref, transform);

  return (
    <div ref={ref} className="strawberry-element">
      {emoji}
    </div>
  );
}

function IceCreamCard() {
  const ref = useRef(null);

  const transform = useCallback((data) => {
    return {
      x: data.x,
      y: data.y,
      opacity: Math.min(1, data.progress * 1.5),
      xPercent: -50,
      yPercent: -50,
    };
  }, []);

  useMotionSubscriber('strawberry-card', ref, transform);

  return (
    <div ref={ref} className="burst-card">
      <div className="badge">Limited Flavor</div>
      <h3>Strawberry Sundae</h3>
      <p>A double scoop of fresh strawberry and creamy vanilla ice cream, topped with rich syrup and juicy strawberry bursts.</p>
      <div className="growth-readout" style={{ color: '#ff6bca', border: '1px solid rgba(255, 107, 202, 0.3)' }}>
        🍓 $4.99 SPECIAL
      </div>
    </div>
  );
}

function IceCreamCenterpiece() {
  const ref = useRef(null);

  const transform = useCallback((data) => {
    return {
      x: data.x,
      y: data.y,
      z: data.z, // Native 3D translation handles scaling automatically via perspective
      xPercent: -50,
      yPercent: -50,
    };
  }, []);

  useMotionSubscriber('ice-cream-center', ref, transform);

  return (
    <div ref={ref} className="ice-cream-wrapper">
      <div className="ice-cream-center-el">🍦</div>
    </div>
  );
}

export default function BurstPage() {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const [isStageVisible, setIsStageVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    if (!stageRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(stageRef.current);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsStageVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      observer.disconnect();
    };
  }, []);

  useMotionPlayer(strawberryScene, containerRef);
  useMotionPlayer(iceCreamCardScene, containerRef, { paused: !isStageVisible });

  const strawCx = dimensions.width * 0.25;
  const strawCy = dimensions.height * 0.5;

  // Map 3D path nodes to 2D for all 10 strawberries dynamically (excluding ice cream center)
  const strawberryPaths = strawberryScene.elements
    .filter((el) => el.id.startsWith('strawberry'))
    .map((el) => {
      const nodes = projectPathNodes3DTo2D(
        el.pathNodes,
        strawCx,
        strawCy,
        0,
        false,
        STRAW_PERSPECTIVE
      );
      return {
        id: el.id,
        d: buildMotionPath(nodes),
      };
    });

  const cardNodes = iceCreamCardScene.elements[0].pathNodes;

  return (
    <div className="app">
      <header className="header">
        <h1>MotionPath <span className="accent">Burst Demo</span></h1>
        <p className="subtitle">Staggered Timeframes • Native 3D Z-Depth Projection</p>
      </header>

      <section ref={containerRef} className="burst-scene">
        <div ref={stageRef} className="burst-stage">
          <div className="scene-label">
            <h2>Multi-Scene Orchestration (Scroll + Timer with Timeframes)</h2>
            <p>Ten scroll-triggered strawberries burst sequentially using staggered timeframes, while a timer-triggered card slides in with a delayed timeframe.</p>
          </div>

          <div className="burst-inner" style={{ perspective: `${STRAW_PERSPECTIVE}px`, perspectiveOrigin: `${strawCx}px ${strawCy}px` }}>
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
              <g transform={`translate(${dimensions.width * 0.72}, ${dimensions.height * 0.5})`}>
                <path d={buildMotionPath(cardNodes)} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="1" strokeDasharray="8 6" />
              </g>
            </svg>

            {strawberryScene.elements
              .filter((el) => el.id.startsWith('strawberry'))
              .map((el) => (
                <Strawberry key={el.id} elementId={el.id} emoji="🍓" />
              ))}

            <IceCreamCenterpiece />

            <IceCreamCard />
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>Scroll down/up to trigger the burst effect</p>
      </footer>
    </div>
  );
}
