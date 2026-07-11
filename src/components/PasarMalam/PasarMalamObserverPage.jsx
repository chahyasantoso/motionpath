import { gsap } from 'gsap';
import { useCallback, useRef } from 'react';
import useMotionProject from '../../hooks/useMotionProject';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import useMotionTrigger from '../../hooks/useMotionTrigger';
import useSmoothScroll from '../../hooks/useSmoothScroll';
import './PasarMalamPage.css';

// Generate paths for 192 static WebP frames
const IMAGE_SEQUENCE_FRAMES = Array.from({ length: 192 }, (_, i) => {
  return `/sequence/frame_${String(i + 1).padStart(4, '0')}.webp`;
});

// ─── Scene Data Config ──────────────────────────────────────────
const pasarMalamScene = {
  motionId: 'pasar-malam-storytelling',
  driver: {
    type: 'timeline',
    sectionId: 'pasar-malam-storytelling',
    trigger: {
      type: 'scroll',
      scrub: 0.5,
      pin: 'pm-stage',
      start: 'top top',
      end: 'bottom bottom'
    }
  },
  tracks: [
    {
      id: 'pasar-malam-bg',
      keyframes: {
        imageSequence: {
          frames: IMAGE_SEQUENCE_FRAMES,
          stops: [
            { p: 0, v: 0, ease: 'none' },
            { p: 1, v: 191 }
          ]
        }
      }
    },
    {
      id: 'hero-title',
      keyframes: {
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.15, v: 1, ease: 'power2.out' },
            { p: 0.8, v: 1 },
            { p: 1, v: 0, ease: 'power2.in' }
          ]
        },
        y: {
          stops: [
            { p: 0, v: 120 },
            { p: 0.25, v: 0, ease: 'power2.out' },
            { p: 0.75, v: 0 },
            { p: 1, v: -120, ease: 'power2.in' }
          ]
        },
        scaleX: {
          stops: [
            { p: 0, v: 1.25 },
            { p: 0.25, v: 1, ease: 'power2.out' },
            { p: 0.75, v: 1 },
            { p: 1, v: 0.8, ease: 'power2.in' }
          ]
        },
        scaleY: {
          stops: [
            { p: 0, v: 1.25 },
            { p: 0.25, v: 1, ease: 'power2.out' },
            { p: 0.75, v: 1 },
            { p: 1, v: 0.8, ease: 'power2.in' }
          ]
        }
      }
    },
    {
      id: 'card-left',
      keyframes: {
        x: {
          stops: [
            { p: 0, v: '-100vw' },
            { p: 0.35, v: 0, ease: 'back.out(1.2)' },
            { p: 0.75, v: 0 },
            { p: 1, v: '-100vw', ease: 'power2.in' }
          ]
        },
        rotation: {
          stops: [
            { p: 0, v: -8 },
            { p: 0.35, v: 0, ease: 'back.out(1.2)' },
            { p: 0.75, v: 0 },
            { p: 1, v: -8, ease: 'power2.in' }
          ]
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.3, v: 1, ease: 'power2.out' },
            { p: 0.75, v: 1 },
            { p: 1, v: 0, ease: 'power2.in' }
          ]
        }
      }
    },
    {
      id: 'card-right',
      keyframes: {
        x: {
          stops: [
            { p: 0, v: '100vw' },
            { p: 0.42, v: 0, ease: 'back.out(1.2)' },
            { p: 0.78, v: 0 },
            { p: 1, v: '100vw', ease: 'power2.in' }
          ]
        },
        rotation: {
          stops: [
            { p: 0, v: 8 },
            { p: 0.42, v: 0, ease: 'back.out(1.2)' },
            { p: 0.78, v: 0 },
            { p: 1, v: 8, ease: 'power2.in' }
          ]
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.37, v: 1, ease: 'power2.out' },
            { p: 0.78, v: 1 },
            { p: 1, v: 0, ease: 'power2.in' }
          ]
        }
      }
    },
    {
      id: 'stats-card',
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 160 },
            { p: 0.3, v: 0, ease: 'power2.out' },
            { p: 0.8, v: 0 },
            { p: 1, v: 160, ease: 'power2.in' }
          ]
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.25, v: 1, ease: 'power2.out' },
            { p: 0.8, v: 1 },
            { p: 1, v: 0, ease: 'power2.in' }
          ]
        },
        '--neon-opacity': {
          stops: [
            { p: 0, v: 1 },
            { p: 0.28, v: 1 },
            { p: 0.29, v: 0.1, ease: 'none' },
            { p: 0.31, v: 1, ease: 'none' },
            { p: 0.48, v: 1 },
            { p: 0.49, v: 0.3, ease: 'none' },
            { p: 0.51, v: 1, ease: 'none' },
            { p: 0.77, v: 1 },
            { p: 0.79, v: 0.15, ease: 'none' },
            { p: 0.81, v: 1, ease: 'none' }
          ]
        }
      }
    }
  ]
};

const lanternScene = {
  motionId: 'lantern-scene',
  driver: {
    type: 'timeline',
    sectionId: 'lantern-scene',
    trigger: {
      type: 'scroll',
      scrub: 0.5,
      trigger: 'pasar-malam-storytelling',  // same section as the main scene
      start: 'top top',
      end: 'bottom bottom'
    }
  },
  tracks: [
    {
      id: 'lantern-1-wrap',
      keyframes: {
        y:       { stops: [{ p: 0, v: -120 }, { p: 0.35, v: 0, ease: 'back.out(1.8)' }, { p: 1, v: 0 }] },
        opacity: { stops: [{ p: 0, v: 0 }, { p: 0.25, v: 1, ease: 'power2.out' }, { p: 1, v: 1 }] }
      }
    },
    {
      id: 'lantern-2-wrap',
      keyframes: {
        y:       { stops: [{ p: 0, v: -150 }, { p: 0.42, v: 0, ease: 'back.out(1.8)' }, { p: 1, v: 0 }] },
        opacity: { stops: [{ p: 0, v: 0 }, { p: 0.30, v: 1, ease: 'power2.out' }, { p: 1, v: 1 }] }
      }
    },
    {
      id: 'lantern-3-wrap',
      keyframes: {
        y:       { stops: [{ p: 0, v: -100 }, { p: 0.38, v: 0, ease: 'back.out(1.8)' }, { p: 1, v: 0 }] },
        opacity: { stops: [{ p: 0, v: 0 }, { p: 0.28, v: 1, ease: 'power2.out' }, { p: 1, v: 1 }] }
      }
    }
  ]
};

// Pure scrollytelling observer. No timelineId/grouping is needed.
// ScrollTrigger naturally handles toggleActions to play/pause the infinite bounce loop.
const lanternBounceObserverScene = {
  motionId: 'lantern-bounce-observer',
  driver: {
    type: 'timeline',
    sectionId: 'lantern-bounce-observer',
    trigger: {
      type: 'scroll',
      scrub: false,
      trigger: 'pasar-malam-storytelling',
      start: '50% top', // triggers past 50% scroll progress (50% from top of hero section)
      toggleActions: 'play pause resume pause',
      duration: 1.2,
      repeat: -1,
      yoyo: true
    }
  },
  tracks: [
    {
      id: 'lantern-1',
      keyframes: {
        y: { stops: [{ p: 0, v: 0 }, { p: 1, v: -18, ease: 'power1.inOut' }] }
      }
    },
    {
      id: 'lantern-2',
      keyframes: {
        y: { stops: [{ p: 0, v: 0 }, { p: 1, v: -12, ease: 'power1.inOut' }] }
      }
    },
    {
      id: 'lantern-3',
      keyframes: {
        y: { stops: [{ p: 0, v: 0 }, { p: 1, v: -20, ease: 'power1.inOut' }] }
      }
    }
  ]
};

const pmObserverProject = {
  schemaVersion: 2,
  projectId: 'pasar-malam-observer-page',
  perspective: 800,
  motions: [pasarMalamScene, lanternScene, lanternBounceObserverScene]
};

// ─── Sub-Components ─────────────────────────────────────────────

function BackgroundSequence() {
  const ref = useRef(null);
  useMotionSubscriber('pasar-malam-bg', ref);
  return <div ref={ref} className="pm-bg-sequence" />;
}

function Lantern({ wrapId, innerId, assetUrl, className }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);

  // Outer wrapper: entry animation
  useMotionSubscriber(wrapId, wrapRef);

  // Inner element: observer-driven bounce
  useMotionSubscriber(innerId, innerRef);

  return (
    <div
      ref={wrapRef}
      className={`pm-lantern-wrap ${className}`}
    >
      <div
        ref={innerRef}
        className="pm-lantern-inner"
        style={{ backgroundImage: `url('${assetUrl}')` }}
      />
    </div>
  );
}

function HeroTitle() {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    const scrollY = rawData.y ?? 0;
    const rotateX = scrollY * 0.15;
    return {
      ...composed,
      rotateX
    };
  }, []);

  useMotionSubscriber('hero-title', ref, transform);

  return (
    <div ref={ref} className="pm-title-element">
      Pasar Malam
      <div className="pm-title-subtitle">The Night Awakens</div>
    </div>
  );
}

function LeftCard() {
  const ref = useRef(null);
  useMotionSubscriber('card-left', ref);

  return (
    <div ref={ref} className="pm-glass-card pm-card-left pm-interactive">
      <div className="pm-card-badge">Street Flavors</div>
      <h3>Nostalgic Tastes</h3>
      <p>Follow the aroma of fresh Apam Balik, grilled Satay, and spun sugar floating under colorful string lights.</p>
    </div>
  );
}

function RightCard() {
  const ref = useRef(null);
  useMotionSubscriber('card-right', ref);

  return (
    <div ref={ref} className="pm-glass-card pm-card-right pm-interactive">
      <div className="pm-card-badge">Night Vibes</div>
      <h3>Carnival Thrills</h3>
      <p>Hear the laughter and music from the Ferris Wheel while glowing neon games light up the tropical midnight sky.</p>
    </div>
  );
}

const easeOut = gsap.parseEase('power2.out');

function StatsCard() {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    if (ref.current) {
      const p = rawData.progress;
      const stallsEl = ref.current.querySelector('.stalls-num');
      const visitorsEl = ref.current.querySelector('.visitors-num');
      if (stallsEl) {
        const t = easeOut(Math.min(1, p / 0.55));
        stallsEl.textContent = `${Math.round(t * 192)}+`;
      }
      if (visitorsEl) {
        const t = easeOut(Math.min(1, p / 0.65));
        visitorsEl.textContent = Math.round(t * 10000).toLocaleString();
      }
    }
    return composeFn(rawData);
  }, []);

  useMotionSubscriber('stats-card', ref, transform);

  return (
    <div ref={ref} className="pm-stats-card pm-interactive">
      <div className="pm-neon-tag">Open</div>
      <div className="pm-stat-item">
        <p className="pm-stat-num stalls-num">0+</p>
        <p className="pm-stat-label">Stalls</p>
      </div>
      <div className="pm-stat-item">
        <p className="pm-stat-num visitors-num">0</p>
        <p className="pm-stat-label">Visitors</p>
      </div>
    </div>
  );
}

// ─── Main Page Export ───────────────────────────────────────────

export default function PasarMalamObserverPage() {
  const storytellingRef = useRef(null);
  const stageRef = useRef(null);

  useMotionTrigger('pasar-malam-storytelling', storytellingRef);
  useMotionTrigger('pm-stage', stageRef);

  // Pure observer-driven approach. No local React state and no hook wiring required.
  useMotionProject(pmObserverProject);
  useSmoothScroll();

  return (
    <div className="pm-container">
      {/* Scroll storytelling stage */}
      <section ref={storytellingRef} className="pm-hero-section">
        <div ref={stageRef} className="pm-stage">
          <BackgroundSequence />
          <div className="pm-overlay" />
          
          {/* Ambient Floating Lanterns */}
          <div className="pm-lanterns-glow">
            <Lantern wrapId="lantern-1-wrap" innerId="lantern-1" assetUrl="/lanterns/lantern-red.svg"  className="pm-lantern-1" />
            <Lantern wrapId="lantern-2-wrap" innerId="lantern-2" assetUrl="/lanterns/lantern-gold.svg" className="pm-lantern-2" />
            <Lantern wrapId="lantern-3-wrap" innerId="lantern-3" assetUrl="/lanterns/lantern-pink.svg" className="pm-lantern-3" />
          </div>

          <div className="pm-content-wrapper">
            <HeroTitle />

            <div className="pm-cards-grid">
              <LeftCard />
              <RightCard />
              <StatsCard />
            </div>
          </div>
        </div>

        {/* Hidden DOM preloader to keep all frames decoded in GPU memory */}
        <div style={{ display: 'none' }}>
          {IMAGE_SEQUENCE_FRAMES.map(src => (
            <img key={src} src={src} alt="" />
          ))}
        </div>
      </section>

      {/* Spacer Section for scrolling past */}
      <section className="pm-scroll-indicator-section">
        <div className="pm-indicator-content">
          <h2>Scroll Down to Explore More</h2>
          <div className="pm-scroll-line" />
        </div>
      </section>
    </div>
  );
}
