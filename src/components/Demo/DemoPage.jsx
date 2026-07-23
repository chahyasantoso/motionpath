import React, { useCallback, useEffect, useRef } from 'react';
import { engine } from '../../engines/Engine.js';
import { createTrack } from '../../lib/createTrack.js';
import useMotionInstance from '../../hooks/useMotionInstance';
import useMotionProject from '../../hooks/useMotionProject';
import useMotionSubscribers from '../../hooks/useMotionSubscribers';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import useMotionTrigger from '../../hooks/useMotionTrigger';
import useSmoothScroll from '../../hooks/useSmoothScroll';
import { buildMotionPath } from '../../utils/pathUtils';
import { project3DTo2D, projectPathNodes3DTo2D, shapeGenerators } from '../../utils/projection3d';
import { gsap } from 'gsap';
import './DemoPage.css';

// Prevent editor auto-cleanup from removing unused React import
const _dummyReactRef = React;

// ─── Scene Data ────────────────────────────────────────────────
const scrollScene = {
  id: 'hero-scrollytelling',
  trigger: {
    type: 'scroll',
    trigger: 'hero-scroll-trigger',
    pin: 'hero-stage-pin',
    scrub: 1,
    start: 'top top',
    end: 'bottom bottom'
  },
  tracks: [
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
  id: 'carousel-storytelling',
  trigger: {
    type: 'scroll',
    trigger: 'carousel-scroll-trigger',
    pin: 'carousel-stage-pin',
    scrub: 1.2,
    start: 'top top',
    end: 'bottom bottom'
  },
  stagger: 0.1,
  staggerTransition: { duration: 0.4, ease: 'power3.out' },
  tracks: [
    {
      id: 'carousel-card-track',
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
            { p: 1.0,  v: 0 }
          ]
        }
      }
    }
  ]
};

const dynamicHelixScene = {
  id: 'helix-storytelling',
  trigger: {
    type: 'scroll',
    trigger: 'helix-scroll-trigger',
    pin: 'helix-stage-pin',
    scrub: 1.2,
    start: 'top top',
    end: 'bottom bottom'
  },
  stagger: 0.16,
  tracks: [
    {
      id: 'helix-card-track',
      keyframes: {
        path: {
          points: helixPathPoints,
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }]
        }
      }
    }
  ]
};

const project = {
  schemaVersion: 2,
  projectId: 'demo-page',
  perspective: 1200,
  motions: [
    scrollScene,
    dynamicCarouselScene,
    dynamicHelixScene
  ]
};

// ─── Animated Elements ─────────────────────────────────────────

function Rocket({ instance, offset = 0 }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    const progress = Math.max(0, Math.min(1, (rawData.pathProgress ?? 0) + offset));
    const composed = composeFn({ ...rawData, pathProgress: progress });

    return {
      ...composed,
      scale: 0.8 + progress * 0.5,
      opacity: 0.4 + progress * 0.6,
    };
  }, [offset]);

  useMotionSubscriber(instance, 'rocket-track', ref, transform);

  return <div ref={ref} className="element rocket">🚀</div>;
}

// Cloud receives coordinate broadcasts from a MotionInstance and moves linearly
function Cloud({ instance }) {
  const ref = useRef(null);
  
  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    return composed;
  }, []);

  useMotionSubscriber(instance, 'cloud', ref, transform);
  return <div ref={ref} className="element cloud">☁️</div>;
}

// CarouselCard receives its own child Track (v4: Track.addChild per card)
function CarouselCard({ track: cardTrack, cardData, onRemove }) {
  const ref = useRef(null);
  const [activeTrack, setActiveTrack] = React.useState(cardTrack);

  const transform = useCallback((rawData, composeFn) => {
    // Exit track: basic compose, no carousel logic
    if (activeTrack !== cardTrack) {
      return composeFn(rawData);
    }

    const cardProgress = rawData.pathProgress ?? 0;
    if (cardProgress <= 0 || cardProgress >= 1) {
      return { display: 'none', opacity: 0 };
    }

    const composed = composeFn(rawData);
    const scale = 0.75 + Math.sin(cardProgress * Math.PI) * 0.35;
    const targetTilt = Math.max(-20, Math.min(20, (composed.rotation ?? 0) * 0.35));
    return {
      ...composed,
      display: 'flex',
      rotation: targetTilt,
      scale,
      rotateY: targetTilt * -0.6,
    };
  }, [activeTrack, cardTrack]);

  useMotionSubscribers([{ track: activeTrack, transformFn: transform }], ref);

  const handleClick = useCallback(() => {
    if (activeTrack !== cardTrack) return; // already exiting

    createTrack({
      id: `exit-${cardData.id}`,
      keyframes: {
        scale: {
          stops: [
            { p: 0.0, v: 1.0 },
            { p: 1.0, v: 0.0 }
          ]
        },
        opacity: {
          stops: [
            { p: 0.0, v: 1.0 },
            { p: 1.0, v: 0.0 }
          ]
        }
      },
      duration: 0.4
    }).then(exitTrack => {
      setActiveTrack(exitTrack);
      gsap.to(exitTrack, {
        progress: 1,
        duration: 0.4,
        ease: 'none',
        onComplete: () => {
          exitTrack.destroy();
          onRemove(cardData.id, cardTrack);
        }
      });
    });
  }, [activeTrack, cardTrack, cardData.id, onRemove]);

  return (
    <div ref={ref} className="element carousel-card" onClick={handleClick} style={{ cursor: 'pointer' }}>
      <div className="card-badge">{cardData.badge}</div>
      <h3>{cardData.title}</h3>
      <p>{cardData.desc}</p>
      <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '8px' }}>(Click to Remove)</div>
    </div>
  );
}

// HelixCard receives its own child Track (v4: Track.addChild per card)
function HelixCard({ track, cardData }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    const cardProgress = rawData.pathProgress ?? 0;

    if (cardProgress <= 0 || cardProgress >= 1) {
      return { display: 'none', opacity: 0 };
    }

    const point3D = composeFn(rawData);
    const projected = project3DTo2D(
      point3D.x,
      point3D.y,
      point3D.z,
      HELIX_CONFIG.cx,
      HELIX_CONFIG.cy,
      HELIX_CONFIG.tiltDeg,
      true
    );

    const depthFactor = (point3D.z + HELIX_CONFIG.radius) / (2 * HELIX_CONFIG.radius);
    const scale = 0.6 + depthFactor * 0.65;
    const opacityBase = 0.4 + depthFactor * 0.6;
    const blur = Math.max(0, (1 - depthFactor) * 4);
    const theta = cardProgress * HELIX_CONFIG.turns * 2 * Math.PI;
    const rotateY = -(theta - Math.PI / 2) * (180 / Math.PI);
    const zIndex = Math.round(depthFactor * 100);

    return {
      display: 'flex',
      x: projected.x,
      y: projected.y,
      xPercent: -50,
      yPercent: -50,
      scale,
      opacity: opacityBase,
      filter: `blur(${blur}px)`,
      zIndex,
      transformPerspective: 1000,
      rotateY,
    };
  }, []);

  useMotionSubscribers([{ track, transformFn: transform }], ref);

  return (
    <div ref={ref} className="element helix-card">
      <div className="card-badge">{cardData.badge}</div>
      <h3>{cardData.title}</h3>
      <p>{cardData.desc}</p>
    </div>
  );
}

// ─── Demo Scenes Container Wrappers ────────────────────────────

function ScrollDemo({ instance }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);

  useMotionTrigger('hero-scroll-trigger', containerRef);
  useMotionTrigger('hero-stage-pin', stageRef);

  return (
    <section ref={containerRef} className="scroll-scene">
      <div className="scene-label">
        <h2>Continuous Path Animation (Scroll-Scrub)</h2>
        <p>A rocket following a 2D bezier path curve. The clouds move linearly on their own independent track.</p>
      </div>

      <div ref={stageRef} className="stage">
        <svg className="path-guide" width="100%" height="100%">
          {scrollScene.tracks.map(el => (
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

        <Cloud instance={instance} />
        <Rocket instance={instance} offset={0.0} />
      </div>
    </section>
  );
}

function CarouselDemo({ instance }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);

  useMotionTrigger('carousel-scroll-trigger', containerRef);
  useMotionTrigger('carousel-stage-pin', stageRef);

  const [cards, setCards] = React.useState(MOCK_CARDS);
  // cardId -> child Track (v4: one Track per card, added to parent track)
  const childTracksMapRef = useRef(new Map());
  const parentTrackRef = useRef(null);
  const [trackVersion, setTrackVersion] = React.useState(0);

  // Get the parent carousel track once the motion is mounted
  useEffect(() => {
    if (instance) {
      parentTrackRef.current = instance.getTrack('carousel-card-track');
    }
  }, [instance]);

  // Create a child Track per card (async), add to parent via Track.addChild
  useEffect(() => {
    const parentTrack = parentTrackRef.current;
    if (!parentTrack) return;

    const map = childTracksMapRef.current;
    const missingCards = cards.filter(c => !map.has(c.id));
    if (missingCards.length === 0) return;

    let cancelled = false;
    const trackCfg = dynamicCarouselScene.tracks[0];
    Promise.all(
      missingCards.map(card =>
        createTrack({ id: `carousel-child-${card.id}`, keyframes: trackCfg.keyframes })
          .then(track => ({ cardId: card.id, track }))
      )
    ).then(results => {
      if (cancelled) return;
      for (const { cardId, track } of results) {
        if (!map.has(cardId)) {
          parentTrack.addChild(track, { stagger: dynamicCarouselScene.stagger });
          map.set(cardId, track);
        }
      }
      setTrackVersion(v => v + 1);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, instance, trackVersion === 0 ? instance : null]);

  const handleRemoveCard = useCallback((cardId, childTrack) => {
    const parentTrack = parentTrackRef.current;
    if (parentTrack && childTrack) {
      parentTrack.removeChild(childTrack.id);
    }
    childTracksMapRef.current.delete(cardId);
    setCards(prev => prev.filter(c => c.id !== cardId));
  }, []);

  const handleAddCard = useCallback(() => {
    const nextId = cards.length > 0 ? Math.max(...cards.map(c => c.id)) + 1 : 1;
    const template = MOCK_CARDS[Math.floor(Math.random() * MOCK_CARDS.length)];
    setCards(prev => [...prev, {
      ...template,
      id: nextId,
      badge: `${String(nextId).padStart(2, '0')} / ${template.badge.split(' / ')[1] || 'DYNAMIC'}`,
    }]);
  }, [cards]);

  return (
    <section ref={containerRef} className="carousel-scene">
      <div className="scene-label">
        <h2>Unlimited Carousel Scene (Scroll Stagger)</h2>
        <p>Dynamic mock cards flowing smoothly on a single Bezier S-curve track with engine-level stagger. (Click any card to trigger schema-defined exit animation!)</p>
      </div>
      <div ref={stageRef} className="carousel-stage">
        {cards.map(card => {
          const childTrack = childTracksMapRef.current.get(card.id);
          if (!childTrack) return null;
          return (
            <CarouselCard
              key={card.id}
              track={childTrack}
              cardData={card}
              onRemove={handleRemoveCard}
            />
          );
        })}
        <svg className="path-guide" width="100%" height="100%">
          <path
            d={buildMotionPath(dynamicCarouselScene.tracks[0].keyframes.path.points)}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
        </svg>
        <button className="add-card-btn-floating" onClick={handleAddCard} title="Add Random Card">
          +
        </button>
      </div>
    </section>
  );
}

function HelixDemo({ instance }) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);

  useMotionTrigger('helix-scroll-trigger', containerRef);
  useMotionTrigger('helix-stage-pin', stageRef);

  const { cx, cy, radius, height, tiltDeg } = HELIX_CONFIG;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const cylinderHeight2D = height * Math.cos(tiltRad);

  const projectedHelixNodes = projectPathNodes3DTo2D(
    dynamicHelixScene.tracks[0].keyframes.path.points,
    cx, cy, tiltDeg, true
  );

  // v4: one child Track per card, added to the parent helix track
  const childTracksRef = useRef([]);
  const [helixTracksReady, setHelixTracksReady] = React.useState(false);

  useEffect(() => {
    if (!instance) return;
    const parentTrack = instance.getTrack('helix-card-track');
    if (!parentTrack) return;

    let cancelled = false;
    const helixCards = MOCK_CARDS.slice(0, 6);
    const trackCfg = dynamicHelixScene.tracks[0];
    Promise.all(
      helixCards.map((_, i) =>
        createTrack({ id: `helix-child-${i}`, keyframes: trackCfg.keyframes })
      )
    ).then(tracks => {
      if (cancelled) return;
      childTracksRef.current = tracks;
      tracks.forEach(track => parentTrack.addChild(track, { stagger: dynamicHelixScene.stagger }));
      setHelixTracksReady(true);
    });

    return () => { cancelled = true; };
  }, [instance]);

  return (
    <section ref={containerRef} className="helix-scene">
      <div className="scene-label">
        <h2>3D Helix Card Flow (Scroll Stagger)</h2>
        <p>Content cards flowing down a vertical spring, rotating 3D tangent to the cylinder surface</p>
      </div>

      <div ref={stageRef} className="helix-stage">
        <svg className="path-guide" width="100%" height="100%">
          <defs>
            <linearGradient id="helix-path-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.05" />
              <stop offset="50%" stopColor="#ff6bca" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.75" />
            </linearGradient>
          </defs>

          <path
            id="path-guide-helix-track"
            d={buildMotionPath(projectedHelixNodes)}
            fill="none"
            stroke="url(#helix-path-gradient)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />

          <line x1={cx - radius} y1={cy} x2={cx - radius} y2={cy + cylinderHeight2D}
            stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1.5" strokeDasharray="4 4" />
          <line x1={cx + radius} y1={cy} x2={cx + radius} y2={cy + cylinderHeight2D}
            stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1.5" strokeDasharray="4 4" />
          <line x1={cx} y1={cy} x2={cx} y2={cy + cylinderHeight2D}
            stroke="rgba(255, 255, 255, 0.015)" strokeWidth="1" strokeDasharray="8 6" />
        </svg>

        {helixTracksReady && MOCK_CARDS.slice(0, 6).map((card, i) => {
          const childTrack = childTracksRef.current[i];
          if (!childTrack) return null;
          return (
            <HelixCard
              key={card.id}
              track={childTrack}
              cardData={card}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function DemoPage() {
  const isLoaded = useMotionProject(project);
  useSmoothScroll();

  // Mount instances explicitly using the new useMotionInstance hook once project has loaded
  const scrollInstance = useMotionInstance(isLoaded ? 'hero-scrollytelling' : null);
  const carouselInstance = useMotionInstance(isLoaded ? 'carousel-storytelling' : null);
  const helixInstance = useMotionInstance(isLoaded ? 'helix-storytelling' : null);

  return (
    <div className="app">
      <header className="header">
        <h1>MotionPath <span className="accent">Hooks Demo</span></h1>
        <p className="subtitle">Zero Re-render • GSAP Pub/Sub • Direct DOM</p>
      </header>

      <ScrollDemo instance={scrollInstance} />

      <div className="spacer" />

      <CarouselDemo instance={carouselInstance} />

      <div className="spacer" />

      <HelixDemo instance={helixInstance} />

      <footer className="footer">
        <p>Scroll back up to replay the scroll scene</p>
      </footer>
    </div>
  );
}
