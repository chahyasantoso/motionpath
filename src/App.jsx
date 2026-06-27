import { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import PathEditor from './components/Editor/PathEditor';
import BurstPage from './BurstPage';
import useMotionPlayer from './hooks/useMotionPlayer';
import useMotionSubscriber from './hooks/useMotionSubscriber';
import { buildMotionPath, convertToCubicPath, getPointOnCubicPath, getPointOnPath } from './lib/pathUtils';
import { project3DTo2D, projectPathNodes3DTo2D, shapeGenerators } from './lib/projection3d';


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

// ─── 3D Helix Path Generator & Scene ───────────────────────────
const HELIX_CONFIG = {
  cx: 640,
  cy: 100,
  radius: 220,
  height: 520,
  turns: 3.0,
  tiltDeg: 0,
};

const helixPathNodes = shapeGenerators.helix({
  radius: HELIX_CONFIG.radius,
  height: HELIX_CONFIG.height,
  turns: HELIX_CONFIG.turns,
});

const helixCubicPath = convertToCubicPath(helixPathNodes);

const helixScene = {
  sceneId: 'helix-storytelling',
  triggerType: 'scroll',
  scrollConfig: { scrub: 1.2, pin: '.helix-stage' },
  elements: [
    {
      id: 'helix-track',
      pathNodes: helixPathNodes,
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

function HelixCard({ index, totalCards, cardData }) {
  const ref = useRef(null);

  const cardSpacing = 0.16; // spacing between cards along the spiral
  const totalOffsetSpan = (totalCards - 1) * cardSpacing;

  const transform = useCallback((data) => {
    // Map global scroll progress to this card's segment
    const cardProgress = (data.progress * (1 + totalOffsetSpan)) - (index * cardSpacing);

    if (cardProgress < 0 || cardProgress > 1) {
      return {
        display: 'none',
        opacity: 0,
      };
    }

    // Get 3D coordinate on path natively
    const point3D = getPointOnCubicPath(helixCubicPath, cardProgress);

    // Project 3D coordinate to 2D
    const projected = project3DTo2D(
      point3D.x,
      point3D.y,
      point3D.z,
      HELIX_CONFIG.cx,
      HELIX_CONFIG.cy,
      HELIX_CONFIG.tiltDeg,
      true // invertTilt
    );

    // Normalize depth: 0 (furthest back) to 1 (closest front)
    // point3D.z goes from -radius to +radius
    const depthFactor = (point3D.z + HELIX_CONFIG.radius) / (2 * HELIX_CONFIG.radius);

    const scale = 0.6 + depthFactor * 0.65;
    const opacityBase = 0.4 + depthFactor * 0.6;
    const blur = Math.max(0, (1 - depthFactor) * 4);
    
    // Y-axis rotation based on theta
    const theta = cardProgress * HELIX_CONFIG.turns * 2 * Math.PI;
    const rotateY = -(theta - Math.PI / 2) * (180 / Math.PI);
    const zIndex = Math.round(depthFactor * 100);

    // Fade cards near the ends
    let opacity = opacityBase;
    if (cardProgress < 0.1) {
      opacity *= (cardProgress / 0.1);
    } else if (cardProgress > 0.9) {
      opacity *= ((1 - cardProgress) / 0.1);
    }

    return {
      display: 'flex',
      x: projected.x,
      y: projected.y,
      xPercent: -50,
      yPercent: -50,
      scale: scale,
      opacity: opacity,
      filter: `blur(${blur}px)`,
      zIndex: zIndex,
      transformPerspective: 1000,
      rotateY: rotateY,
    };
  }, [index, totalOffsetSpan]);

  useMotionSubscriber('helix-track', ref, transform);

  return (
    <div ref={ref} className="element helix-card">
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



function HelixDemo() {
  const containerRef = useRef(null);
  useMotionPlayer(helixScene, containerRef);

  const { cx, cy, radius, height, tiltDeg } = HELIX_CONFIG;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const cylinderHeight2D = height * Math.cos(tiltRad);

  // Project 3D path nodes to 2D for the SVG guide
  const projectedHelixNodes = projectPathNodes3DTo2D(
    helixScene.elements[0].pathNodes,
    cx, cy, tiltDeg, true
  );

  return (
    <section ref={containerRef} className="helix-scene">
      <div className="scene-label">
        <h2>3D Helix Card Flow (Scroll)</h2>
        <p>Content cards flowing down a vertical spring, rotating 3D tangent to the cylinder surface</p>
      </div>

      <div className="helix-stage">
        {/* SVG guides for the cylinder outlines */}
        <svg className="path-guide" width="100%" height="100%">
          <defs>
            <linearGradient id="helix-path-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.05" />
              <stop offset="50%" stopColor="#ff6bca" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.75" />
            </linearGradient>
          </defs>

          {/* Dotted path of the spring track */}
          <path
            id="path-guide-helix-track"
            d={buildMotionPath(projectedHelixNodes)}
            fill="none"
            stroke="url(#helix-path-gradient)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />

          {/* Virtual cylinder visual boundaries */}
          <line
            x1={cx - radius}
            y1={cy}
            x2={cx - radius}
            y2={cy + cylinderHeight2D}
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1={cx + radius}
            y1={cy}
            x2={cx + radius}
            y2={cy + cylinderHeight2D}
            stroke="rgba(255, 255, 255, 0.04)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy + cylinderHeight2D}
            stroke="rgba(255, 255, 255, 0.015)"
            strokeWidth="1"
            strokeDasharray="8 6"
          />
        </svg>

        {/* The list of cards flowing down the spiral */}
        {MOCK_CARDS.slice(0, 6).map((card, i) => (
          <HelixCard
            key={card.id}
            index={i}
            totalCards={6}
            cardData={card}
          />
        ))}
      </div>
    </section>
  );
}

// ─── App ───────────────────────────────────────────────────────

function DemoPage() {
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

      <HelixDemo />

      <footer className="footer">
        <p>Scroll back up to replay the scroll scene</p>
      </footer>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={<PathEditor onClose={() => navigate('/demo')} />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/burst" element={<BurstPage />} />
    </Routes>
  );
}
