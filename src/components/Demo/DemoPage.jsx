import React, { useCallback, useMemo, useRef } from 'react';
import useMotionProject from '../../hooks/useMotionProject';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import useSmoothScroll from '../../hooks/useSmoothScroll';
import { buildMotionPath } from '../../lib/pathUtils';
import { project3DTo2D, projectPathNodes3DTo2D, shapeGenerators } from '../../lib/projection3d';
import './DemoPage.css';

// ─── Scene Data ────────────────────────────────────────────────
const scrollScene = {
  sceneId: 'hero-scrollytelling',
  trigger: {
    type: 'scroll',
    scrub: 1,
    pin: 'stage',
    start: 'top top',
    end: 'bottom bottom'
  },
  elements: [
    {
      id: 'rocket-track',
      keyframes: {
        path: {
          points: [
            { x: 50, y: 300 },
            { x: 400, y: 100, ctrlX: 200, ctrlY: -50 },
            { x: 900, y: 350, ctrlX: 700, ctrlY: 500 },
          ],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
          autoRotate: true
        }
      }
    },
    {
      id: 'cloud',
      keyframes: {
        path: {
          points: [
            { x: -100, y: 80 },
            { x: 1100, y: 80 },
          ],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    },
  ],
};

// ─── 3D Helix Path Generator Configs ───────────────────────────
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

const helixPathPoints = helixPathNodes;
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

const dynamicCarouselScene = {
  sceneId: 'carousel-storytelling',
  trigger: {
    type: 'scroll',
    scrub: 1.2,
    pin: 'carousel-stage',
    start: 'top top',
    end: 'bottom bottom'
  },
  stagger: 0.14,
  elements: MOCK_CARDS.map((card, i) => ({
    id: `carousel-card-${i}`,
    keyframes: {
      path: {
        points: [
          { x: -350, y: 400 },
          { x: 300, y: 150, ctrlX: -20, ctrlY: 100 },
          { x: 950, y: 500, ctrlX: 620, ctrlY: 200 },
          { x: 1600, y: 200, ctrlX: 1280, ctrlY: 800 },
          { x: 2200, y: 400, ctrlX: 1920, ctrlY: -400 },
        ],
        stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
        autoRotate: true
      },
      opacity: {
        stops: [
          { p: 0.0, v: 0 },
          { p: 0.15, v: 1 },
          { p: 0.85, v: 1 },
          { p: 1.0, v: 0 }
        ]
      }
    }
  }))
};

const dynamicHelixScene = {
  sceneId: 'helix-storytelling',
  trigger: {
    type: 'scroll',
    scrub: 1.2,
    pin: 'helix-stage',
    start: 'top top',
    end: 'bottom bottom'
  },
  stagger: 0.16,
  elements: MOCK_CARDS.slice(0, 6).map((card, i) => ({
    id: `helix-card-${i}`,
    keyframes: {
      path: {
        points: helixPathPoints,
        stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
      }
    }
  }))
};

const project = {
  schemaVersion: 1,
  projectId: 'demo-page',
  perspective: 1200,
  scenarios: [
    scrollScene,
    dynamicCarouselScene,
    dynamicHelixScene
  ]
};

// ─── Animated Elements ─────────────────────────────────────────

function Rocket({ offset = 0 }) {
  const ref = useRef(null);

  // transformFn receives rawData and composeFn
  const transform = useCallback((rawData, composeFn) => {
    const progress = Math.max(0, Math.min(1, (rawData.pathProgress ?? 0) + offset));
    // Spread rawData to preserve cubicPath and autoRotate — only override progress
    const composed = composeFn({ ...rawData, pathProgress: progress });

    return {
      ...composed,
      scale: 0.8 + progress * 0.5,
      opacity: 0.4 + progress * 0.6,
    };
  }, [offset]);

  useMotionSubscriber('rocket-track', ref, transform);

  return <div ref={ref} data-motion-id="rocket-track" className="element rocket">🚀</div>;
}

function Cloud() {
  const ref = useRef(null);
  
  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    return composed;
  }, []);

  useMotionSubscriber('cloud', ref, transform);
  return <div ref={ref} data-motion-id="cloud" className="element cloud">☁️</div>;
}

function CarouselCard({ elementId, cardData }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    const cardProgress = rawData.pathProgress ?? 0;

    // Filter visibility (hide cards outside active path progress segment)
    if (cardProgress <= 0 || cardProgress >= 1) {
      return {
        display: 'none',
        opacity: 0,
      };
    }

    const composed = composeFn(rawData);

    // Scale peaks in the middle of the screen
    const scale = 0.75 + Math.sin(cardProgress * Math.PI) * 0.35;

    // Premium 3D rotation: lean the card slightly based on curve tangent
    const targetTilt = Math.max(-20, Math.min(20, composed.rotation * 0.35));

    return {
      ...composed,
      display: 'flex',
      rotation: targetTilt,
      scale: scale,
      transformPerspective: 1000,
      rotateY: targetTilt * -0.6,
    };
  }, []);

  useMotionSubscriber(elementId, ref, transform);

  return (
    <div ref={ref} data-motion-id={elementId} className="element carousel-card">
      <div className="card-badge">{cardData.badge}</div>
      <h3>{cardData.title}</h3>
      <p>{cardData.desc}</p>
    </div>
  );
}

function HelixCard({ elementId, cardData }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    const cardProgress = rawData.pathProgress ?? 0;

    if (cardProgress <= 0 || cardProgress >= 1) {
      return {
        display: 'none',
        opacity: 0,
      };
    }

    // Get 3D coordinate on path natively via composeFn
    const point3D = composeFn(rawData);

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

    return {
      display: 'flex',
      x: projected.x,
      y: projected.y,
      xPercent: -50,
      yPercent: -50,
      scale: scale,
      opacity: opacityBase,
      filter: `blur(${blur}px)`,
      zIndex: zIndex,
      transformPerspective: 1000,
      rotateY: rotateY,
    };
  }, []);

  useMotionSubscriber(elementId, ref, transform);

  return (
    <div ref={ref} data-motion-id={elementId} className="element helix-card">
      <div className="card-badge">{cardData.badge}</div>
      <h3>{cardData.title}</h3>
      <p>{cardData.desc}</p>
    </div>
  );
}

// ─── Demo Scenes Container Wrappers ────────────────────────────

function ScrollDemo() {
  const containerRef = useRef(null);

  return (
    <section ref={containerRef} data-motion-id={scrollScene.sceneId} className="scroll-scene">
      <div className="scene-label">
        <h2>Continuous Path Animation (Scroll-Scrub)</h2>
        <p>A rocket following a 2D bezier path curve. The clouds move linearly on their own independent track.</p>
      </div>

      <div data-motion-id="stage" className="stage">
        {/* Render paths using the exact coordinate config to overlay guide lines */}
        <svg className="path-guide" width="100%" height="100%">
          {scrollScene.elements.map(el => (
            <path
              key={el.id}
              id={`path-guide-${el.id}`}
              d={buildMotionPath(el.keyframes.path.points)}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
          ))}
        </svg>

        <Cloud />
        <Rocket offset={0.0} />
      </div>
    </section>
  );
}

function CarouselDemo() {
  const containerRef = useRef(null);

  return (
    <section ref={containerRef} data-motion-id={dynamicCarouselScene.sceneId} className="carousel-scene">
      <div className="scene-label">
        <h2>Unlimited Carousel Scene (Scroll Stagger)</h2>
        <p>Dynamic mock cards flowing smoothly on a single Bezier S-curve track with engine-level stagger</p>
      </div>
      <div data-motion-id="carousel-stage" className="carousel-stage">
        {MOCK_CARDS.map((card, i) => (
          <CarouselCard
            key={card.id}
            elementId={`carousel-card-${i}`}
            cardData={card}
          />
        ))}
        {/* Path guides generated from scene data */}
        <svg className="path-guide" width="100%" height="100%">
          <path
            d={buildMotionPath(dynamicCarouselScene.elements[0].keyframes.path.points)}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
        </svg>
      </div>
    </section>
  );
}

function HelixDemo() {
  const containerRef = useRef(null);

  const { cx, cy, radius, height, tiltDeg } = HELIX_CONFIG;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const cylinderHeight2D = height * Math.cos(tiltRad);

  // Project 3D path nodes to 2D for the SVG guide
  const projectedHelixNodes = projectPathNodes3DTo2D(
    dynamicHelixScene.elements[0].keyframes.path.points,
    cx, cy, tiltDeg, true
  );

  return (
    <section ref={containerRef} data-motion-id={dynamicHelixScene.sceneId} className="helix-scene">
      <div className="scene-label">
        <h2>3D Helix Card Flow (Scroll Stagger)</h2>
        <p>Content cards flowing down a vertical spring, rotating 3D tangent to the cylinder surface</p>
      </div>

      <div data-motion-id="helix-stage" className="helix-stage">
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
            elementId={`helix-card-${i}`}
            cardData={card}
          />
        ))}
      </div>
    </section>
  );
}

export default function DemoPage() {
  useMotionProject(project);
  useSmoothScroll();

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
