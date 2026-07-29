import { gsap } from "gsap";
import { useCallback, useRef, useState } from "react";
import useMotionProject from "../../hooks/useMotionProject";
import useMotionSubscriber from "../../hooks/useMotionSubscriber";
import useMotionTimelinePlayback from "../../hooks/useMotionTimelinePlayback";
import useScrollMotion from "../../hooks/useScrollMotion";
import useTimeMotion from "../../hooks/useTimeMotion";
import useSmoothScroll from "../../hooks/useSmoothScroll";
import {
  IMAGE_SEQUENCE_FRAMES,
  pasarMalamScene,
  pmProject,
} from "./pasarMalamMotions.js";
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
  onProgress,
}) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);

  // Outer wrapper: driven by scroll scenario (entry y + opacity)
  // Read scroll progress here to gate the bounce
  const wrapTransform = useCallback(
    (rawData, composeFn) => {
      if (rawData.progress !== undefined) {
        onProgress?.(rawData.progress);
      }
      return composeFn(rawData);
    },
    [onProgress],
  );

  useMotionSubscriber(wrapInstance, wrapId, wrapRef, wrapTransform);

  // Inner element: driven by time/bounce scenario (y oscillation)
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
    // Custom 3D tilt based on vertical y offset
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

export default function PasarMalamPage() {
  const [bouncing, setBouncing] = useState(false);
  const bouncingRef = useRef(false);

  const isLoaded = useMotionProject(pmProject);
  const { refs, instance: storytellingInstance } = useScrollMotion(
    isLoaded ? pasarMalamScene : null,
  );
  // autoplay:false is authored on the motion's trigger — a mount-time config
  // bag would be dropped, since Engine.mountInstance(id) takes no overrides.
  const { instance: bounceInstance } = useTimeMotion(
    isLoaded ? "lantern-bounce" : null,
  );

  useMotionTimelinePlayback(bounceInstance, bouncing);
  useSmoothScroll();

  // Gate: lantern-1 reports its scroll progress via onProgress.
  // setBouncing fires only when crossing the 0.5 threshold — never every tick.
  const onLanternProgress = useCallback((progress) => {
    const should = progress >= 0.5;
    if (should !== bouncingRef.current) {
      bouncingRef.current = should;
      setBouncing(should);
    }
  }, []);

  return (
    <div className="pm-container">
      {/* Scroll storytelling stage */}
      <section ref={refs.trigger} className="pm-hero-section">
        <div ref={refs.pin} className="pm-stage">
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
              onProgress={onLanternProgress}
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

      {/* Second section to scroll past and trigger animations */}
      <section className="pm-scroll-indicator-section">
        <div className="pm-footer-content">
          <h2>An Immersive Journey</h2>
          <p>
            This storytelling experience showcases the smooth orchestration of
            WebP image sequences combined with flying glassmorphism and
            real-time DOM counters running completely outside of React&apos;s
            render loop for maximum performance.
          </p>
          <div className="pm-scroll-badge">Scroll Up to Replay</div>
        </div>
      </section>
    </div>
  );
}
