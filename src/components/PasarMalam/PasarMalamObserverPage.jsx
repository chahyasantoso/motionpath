import { gsap } from "gsap";
import { useCallback, useRef } from "react";
import useMotionProject from "../../hooks/useMotionProject";
import useMotionSubscriber from "../../hooks/useMotionSubscriber";
import useScrollMotion from "../../hooks/useScrollMotion";
import useSmoothScroll from "../../hooks/useSmoothScroll";
import {
  IMAGE_SEQUENCE_FRAMES,
  lanternBounceObserverScene,
  pmObserverProject,
  pmoStorytellingScene,
} from "./pasarMalamObserverMotions.js";
import "./PasarMalamPage.css";

// ─── Sub-Components ─────────────────────────────────────────────

function BackgroundSequence({ instance }) {
  const ref = useRef(null);
  useMotionSubscriber(instance, "pasar-malam-bg", ref);
  return <div ref={ref} className="pm-bg-sequence" />;
}

function Lantern({
  wrapInstance,
  bounceInstance,
  wrapId,
  innerId,
  assetUrl,
  className,
}) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);

  // Outer wrapper: scrubbed entry animation
  useMotionSubscriber(wrapInstance, wrapId, wrapRef);

  // Inner element: observer-driven bounce. No progress gate, no React state —
  // ScrollTrigger's toggleActions plays and parks the loop on its own.
  useMotionSubscriber(bounceInstance, innerId, innerRef);

  return (
    <div ref={wrapRef} className={`pm-lantern-wrap ${className}`}>
      <div
        ref={innerRef}
        className="pm-lantern-inner"
        style={{ backgroundImage: `url('${assetUrl}')` }}
      />
    </div>
  );
}

function HeroTitle({ instance }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    const scrollY = rawData.y ?? 0;
    const rotateX = scrollY * 0.15;
    return {
      ...composed,
      rotateX,
    };
  }, []);

  useMotionSubscriber(instance, "hero-title", ref, transform);

  return (
    <div ref={ref} className="pm-title-element">
      Pasar Malam
      <div className="pm-title-subtitle">The Night Awakens</div>
    </div>
  );
}

function LeftCard({ instance }) {
  const ref = useRef(null);
  useMotionSubscriber(instance, "card-left", ref);

  return (
    <div ref={ref} className="pm-glass-card pm-card-left pm-interactive">
      <div className="pm-card-badge">Street Flavors</div>
      <h3>Nostalgic Tastes</h3>
      <p>
        Follow the aroma of fresh Apam Balik, grilled Satay, and spun sugar
        floating under colorful string lights.
      </p>
    </div>
  );
}

function RightCard({ instance }) {
  const ref = useRef(null);
  useMotionSubscriber(instance, "card-right", ref);

  return (
    <div ref={ref} className="pm-glass-card pm-card-right pm-interactive">
      <div className="pm-card-badge">Night Vibes</div>
      <h3>Carnival Thrills</h3>
      <p>
        Hear the laughter and music from the Ferris Wheel while glowing neon
        games light up the tropical midnight sky.
      </p>
    </div>
  );
}

const easeOut = gsap.parseEase("power2.out");

function StatsCard({ instance }) {
  const ref = useRef(null);

  const transform = useCallback((rawData, composeFn) => {
    if (ref.current) {
      const p = rawData.progress;
      const stallsEl = ref.current.querySelector(".stalls-num");
      const visitorsEl = ref.current.querySelector(".visitors-num");
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

  useMotionSubscriber(instance, "stats-card", ref, transform);

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
  // Both motions observe the same hero section, so the page owns the refs.
  const heroRef = useRef(null);
  const stageRef = useRef(null);

  const isLoaded = useMotionProject(pmObserverProject);

  const { instance: storytellingInstance } = useScrollMotion(
    isLoaded ? pmoStorytellingScene : null,
    { trigger: heroRef, pin: stageRef },
  );
  const { instance: bounceInstance } = useScrollMotion(
    isLoaded ? lanternBounceObserverScene : null,
    { trigger: heroRef },
  );

  useSmoothScroll();

  return (
    <div className="pm-container">
      {/* Scroll storytelling stage */}
      <section ref={heroRef} className="pm-hero-section">
        <div ref={stageRef} className="pm-stage">
          <BackgroundSequence instance={storytellingInstance} />
          <div className="pm-overlay" />

          {/* Ambient Floating Lanterns */}
          <div className="pm-lanterns-glow">
            <Lantern
              wrapInstance={storytellingInstance}
              bounceInstance={bounceInstance}
              wrapId="lantern-1-wrap"
              innerId="lantern-1"
              assetUrl="/lanterns/lantern-red.svg"
              className="pm-lantern-1"
            />
            <Lantern
              wrapInstance={storytellingInstance}
              bounceInstance={bounceInstance}
              wrapId="lantern-2-wrap"
              innerId="lantern-2"
              assetUrl="/lanterns/lantern-gold.svg"
              className="pm-lantern-2"
            />
            <Lantern
              wrapInstance={storytellingInstance}
              bounceInstance={bounceInstance}
              wrapId="lantern-3-wrap"
              innerId="lantern-3"
              assetUrl="/lanterns/lantern-pink.svg"
              className="pm-lantern-3"
            />
          </div>

          <div className="pm-content-wrapper">
            <HeroTitle instance={storytellingInstance} />
            <LeftCard instance={storytellingInstance} />
            <RightCard instance={storytellingInstance} />
            <StatsCard instance={storytellingInstance} />
          </div>
        </div>

        {/* Hidden DOM preloader to keep all frames decoded in GPU memory */}
        <div style={{ display: "none" }}>
          {IMAGE_SEQUENCE_FRAMES.map((src) => (
            <img key={src} src={src} alt="" />
          ))}
        </div>
      </section>

      {/* Spacer Section for scrolling past */}
      <section className="pm-scroll-indicator-section">
        <div className="pm-footer-content">
          <h2>Scroll Down to Explore More</h2>
          <div className="pm-scroll-badge">Observer driven</div>
        </div>
      </section>
    </div>
  );
}
