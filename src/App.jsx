import React, { useRef, useCallback, useState } from 'react';
import useMotionPlayer from './hooks/useMotionPlayer';
import useMotionSubscriber from './hooks/useMotionSubscriber';
import { buildMotionPath } from './lib/motionEngine';
import './App.css';

// ─── Scene Data ────────────────────────────────────────────────
const scrollScene = {
  sceneId: 'hero-scrollytelling',
  triggerType: 'scroll',
  scrollConfig: { scrub: 1, pin: '.stage' },
  elements: [
    {
      id: 'rocket',
      pathNodes: [
        { x: 50, y: 300 },
        { x: 400, y: 100, ctrlX: 200, ctrlY: -50 },
        { x: 900, y: 350, ctrlX: 700, ctrlY: 500 },
      ],
    },
    {
      id: 'cloud',
      pathNodes: [
        { x: -100, y: 80 },
        { x: 1100, y: 80 },
      ],
    },
  ],
};

const timerScene = {
  sceneId: 'orbit-demo',
  triggerType: 'timer',
  elements: [
    {
      id: 'orbiter',
      pathNodes: [
        { x: 0, y: 0 },
        { x: 120, y: -60, ctrlX: 120, ctrlY: 0 },
        { x: 0, y: -120, ctrlX: 120, ctrlY: -120 },
        { x: -120, y: -60, ctrlX: -120, ctrlY: -120 },
        { x: 0, y: 0, ctrlX: -120, ctrlY: 0 },
      ],
      duration: 3,
      ease: 'none',
      repeat: -1,
    },
  ],
};

// ─── Animated Elements ─────────────────────────────────────────

function Rocket() {
  const ref = useRef(null);

  // transformFn: uses progress to drive opacity & scale
  const transform = useCallback((data) => ({
    x: data.x,
    y: data.y,
    rotation: data.rotation,
    xPercent: -50,
    yPercent: -50,
    scale: 0.8 + data.progress * 0.5,
    opacity: 0.4 + data.progress * 0.6,
  }), []);

  useMotionSubscriber('rocket', ref, transform);

  return <div ref={ref} className="element rocket">🚀</div>;
}

function Cloud() {
  const ref = useRef(null);
  
  // transformFn: centers the cloud on its coordinates
  const transform = useCallback((data) => ({
    x: data.x,
    y: data.y,
    rotation: data.rotation,
    xPercent: -50,
    yPercent: -50,
  }), []);

  useMotionSubscriber('cloud', ref, transform);
  return <div ref={ref} className="element cloud">☁️</div>;
}

function Orbiter() {
  const ref = useRef(null);

  // transformFn: uses progress to drive scale (size) for a 3D orbit effect
  const transform = useCallback((data) => ({
    x: data.x,
    y: data.y,
    rotation: data.rotation,
    xPercent: -50,
    yPercent: -50,
    scale: 0.8 + Math.cos(data.progress * 2 * Math.PI) * 0.4,
  }), []);

  useMotionSubscriber('orbiter', ref, transform);
  return <div ref={ref} className="element orbiter">🛰️</div>;
}

// ─── Scene Containers ──────────────────────────────────────────

function ScrollDemo() {
  const containerRef = useRef(null);
  useMotionPlayer(scrollScene, containerRef);

  return (
    <section ref={containerRef} className="scroll-scene">
      <div className="scene-label">
        <h2>Scroll Scene</h2>
        <p>Scroll down to animate — rocket uses <code>transformFn</code> with progress</p>
      </div>
      <div className="stage">
        <Rocket />
        <Cloud />
        {/* Path guides generated from scene data */}
        <svg className="path-guide" width="100%" height="100%">
          {scrollScene.elements.map(el => (
            <path
              key={el.id}
              d={buildMotionPath(el.pathNodes)}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
          ))}
        </svg>
      </div>
    </section>
  );
}

function TimerDemo() {
  const containerRef = useRef(null);
  const [active, setActive] = useState(true);

  // Keep the scene initialized, just control playback dynamically via options
  useMotionPlayer(timerScene, containerRef, { paused: !active });

  return (
    <section ref={containerRef} className="timer-scene">
      <div className="scene-label">
        <h2>Timer Scene (Auto-play)</h2>
        <p>Infinite orbit loop — play/pause without unmounting</p>
        <button onClick={() => setActive(a => !a)} className="toggle-btn">
          {active ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>
      <div className="orbit-stage">
        <div className="orbit-center">●</div>
        {/* Dynamic path guide for the orbiter centered at (150, 150) */}
        <svg className="path-guide" width="100%" height="100%">
          {timerScene.elements.map(el => (
            <g key={el.id} transform="translate(150, 150)">
              <path
                d={buildMotionPath(el.pathNodes)}
                fill="none"
                stroke="rgba(255,107,202,0.15)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            </g>
          ))}
        </svg>
        <Orbiter />
      </div>
    </section>
  );
}

// ─── App ───────────────────────────────────────────────────────

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <h1>MotionPath <span className="accent">Hooks Demo</span></h1>
        <p className="subtitle">Zero Re-render • GSAP Pub/Sub • Direct DOM</p>
      </header>

      <ScrollDemo />

      <div className="spacer" />

      <TimerDemo />

      <footer className="footer">
        <p>Scroll back up to replay the scroll scene</p>
      </footer>
    </div>
  );
}
