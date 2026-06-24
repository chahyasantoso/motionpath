import React, { useRef, useCallback, useState } from 'react';
import useMotionPlayer from './hooks/useMotionPlayer';
import useMotionSubscriber from './hooks/useMotionSubscriber';
import { buildMotionPath, getPointOnPath } from './lib/motionEngine';
import './App.css';

// ─── Scene Data ────────────────────────────────────────────────
const scrollScene = {
  sceneId: 'hero-scrollytelling',
  triggerType: 'scroll',
  scrollConfig: { scrub: 1, pin: '.stage' },
  elements: [
    {
      id: 'rocket-track',
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

const carouselScene = {
  sceneId: 'carousel-storytelling',
  triggerType: 'scroll',
  scrollConfig: { scrub: 1.2, pin: '.carousel-stage' },
  elements: [
    {
      id: 'carousel-track',
      pathNodes: [
        { x: -350, y: 400 },
        { x: 300, y: 150, ctrlX: -20, ctrlY: 100 },
        { x: 950, y: 500, ctrlX: 620, ctrlY: 200 },
        { x: 1600, y: 200, ctrlX: 1280, ctrlY: 800 },
        { x: 2200, y: 400, ctrlX: 1920, ctrlY: -400 },
      ],
    },
  ],
};

const MOCK_CARDS = [
  { id: 1, badge: '01 / IMAGINATION', title: 'Fluid Motion Engine', desc: 'Harnessing the power of GSAP Pub/Sub for sub-millisecond DOM updates.' },
  { id: 2, badge: '02 / ARCHITECTURE', title: 'Zero Re-renders', desc: 'No React component updates during animation cycles for maximum 60FPS performance.' },
  { id: 3, badge: '03 / CREATIVE', title: 'Bezier Interpolation', desc: 'Custom paths calculated dynamically with tangent-aligned rotations.' },
  { id: 4, badge: '04 / INTERACTIVE', title: 'Interactive Cards', desc: 'Cards respond to mouse hover with smooth glassmorphic highlighting.' },
  { id: 5, badge: '05 / DESIGN', title: 'Vibrant Aesthetics', desc: 'Deep cosmic palettes, glassmorphism, and smooth typography curves.' },
  { id: 6, badge: '06 / PERFORMANCE', title: 'Scrubbed Timelines', desc: 'Perfect synchronization between page scroll and complex motion paths.' },
  { id: 7, badge: '07 / AWWWARDS', title: 'Storytelling Layouts', desc: 'Create immersive cinematic scrollytelling experiences that engage users.' },
  { id: 8, badge: '08 / ANTIGRAVITY', title: 'Endless Horizons', desc: 'Scaling up to unlimited items on custom paths without duplicating nodes.' },
];

// ─── Animated Elements ─────────────────────────────────────────

function Rocket({ offset = 0 }) {
  const ref = useRef(null);

  // transformFn: uses progress to drive opacity & scale, mapping coordinates using the helper utility
  const transform = useCallback((data) => {
    const pathEl = document.querySelector('#path-guide-rocket-track');
    const point = getPointOnPath(pathEl, data.progress, offset);

    return {
      x: point.x,
      y: point.y,
      rotation: point.rotation,
      xPercent: -50,
      yPercent: -50,
      scale: 0.8 + point.progress * 0.5,
      opacity: 0.4 + point.progress * 0.6,
    };
  }, [offset]);

  useMotionSubscriber('rocket-track', ref, transform);

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

function CarouselCard({ index, totalCards, cardData }) {
  const ref = useRef(null);

  const cardSpacing = 0.14; // spacing between cards along the path
  const totalOffsetSpan = (totalCards - 1) * cardSpacing;

  const transform = useCallback((data) => {
    const pathEl = document.querySelector('#path-guide-carousel-track');
    if (!pathEl) return {};

    // Map global progress to this card's segment
    const cardProgress = (data.progress * (1 + totalOffsetSpan)) - (index * cardSpacing);

    // Filter visibility
    if (cardProgress < 0 || cardProgress > 1) {
      return {
        display: 'none',
        opacity: 0,
      };
    }

    const point = getPointOnPath(pathEl, cardProgress);

    // Fade-in / Fade-out near edges
    let opacity = 1;
    if (cardProgress < 0.15) {
      opacity = cardProgress / 0.15;
    } else if (cardProgress > 0.85) {
      opacity = (1 - cardProgress) / 0.15;
    }

    // Scale peaks in the middle of the screen
    const scale = 0.75 + Math.sin(cardProgress * Math.PI) * 0.35;

    // Premium 3D rotation: lean the card slightly based on curve tangent
    const targetTilt = Math.max(-20, Math.min(20, point.rotation * 0.35));

    return {
      display: 'flex',
      x: point.x,
      y: point.y,
      xPercent: -50,
      yPercent: -50,
      rotation: targetTilt,
      scale: scale,
      opacity: opacity,
      transformPerspective: 1000,
      rotateY: targetTilt * -0.6,
    };
  }, [index, totalOffsetSpan]);

  useMotionSubscriber('carousel-track', ref, transform);

  return (
    <div ref={ref} className="element carousel-card">
      <div className="card-badge">{cardData.badge}</div>
      <h3>{cardData.title}</h3>
      <p>{cardData.desc}</p>
    </div>
  );
}

// ─── Scene Containers ──────────────────────────────────────────

function ScrollDemo() {
  const containerRef = useRef(null);
  useMotionPlayer(scrollScene, containerRef);

  return (
    <section ref={containerRef} className="scroll-scene">
      <div className="scene-label">
        <h2>Scroll Scene</h2>
        <p>Scroll down to animate — 5 rockets follow the same track with offsets</p>
      </div>
      <div className="stage">
        <Rocket offset={0} />
        <Rocket offset={-0.04} />
        <Rocket offset={-0.08} />
        <Rocket offset={-0.12} />
        <Rocket offset={-0.16} />
        <Cloud />
        {/* Path guides generated from scene data */}
        <svg className="path-guide" width="100%" height="100%">
          {scrollScene.elements.map(el => (
            <path
              key={el.id}
              id={`path-guide-${el.id}`}
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

function CarouselDemo() {
  const containerRef = useRef(null);
  useMotionPlayer(carouselScene, containerRef);

  return (
    <section ref={containerRef} className="carousel-scene">
      <div className="scene-label">
        <h2>Unlimited Carousel Scene (Scroll)</h2>
        <p>Dynamic mock cards flowing smoothly on a single Bezier S-curve track <code>carousel-track</code></p>
      </div>
      <div className="carousel-stage">
        {MOCK_CARDS.map((card, i) => (
          <CarouselCard
            key={card.id}
            index={i}
            totalCards={MOCK_CARDS.length}
            cardData={card}
          />
        ))}
        {/* Path guides generated from scene data */}
        <svg className="path-guide" width="100%" height="100%">
          {carouselScene.elements.map(el => (
            <path
              key={el.id}
              id={`path-guide-${el.id}`}
              d={buildMotionPath(el.pathNodes)}
              fill="none"
              stroke="rgba(124, 92, 255, 0.08)"
              strokeWidth="2"
              strokeDasharray="10 8"
            />
          ))}
        </svg>
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

      <CarouselDemo />

      <div className="spacer" />

      <TimerDemo />

      <footer className="footer">
        <p>Scroll back up to replay the scroll scene</p>
      </footer>
    </div>
  );
}
