import { gsap } from "gsap";
import { useCallback, useRef, useState } from "react";
import useMotionProject from "../../hooks/useMotionProject";
import useMotionSubscriber from "../../hooks/useMotionSubscriber";
import useMotionTimelinePlayback from "../../hooks/useMotionTimelinePlayback";
import useScrollMotion from "../../hooks/useScrollMotion";
import useTimeMotion from "../../hooks/useTimeMotion";
import useSmoothScroll from "../../hooks/useSmoothScroll";
import "./PasarMalamPage.css";

// Generate paths for 192 static WebP frames
const IMAGE_SEQUENCE_FRAMES = Array.from({ length: 192 }, (_, i) => {
  return `/sequence/frame_${String(i + 1).padStart(4, "0")}.webp`;
});

// ─── Scene Data Config ──────────────────────────────────────────
const pasarMalamScene = {
  id: "pasar-malam-storytelling",
  trigger: {
    type: "scroll",
    scrub: 0.5,
    pin: "pin",
    start: "top top",
    end: "bottom bottom",
  },
  tracks: [
    {
      id: "pasar-malam-bg",
      keyframes: {
        imageSequence: {
          frames: IMAGE_SEQUENCE_FRAMES,
          stops: [
            { p: 0, v: 0, ease: "none" },
            { p: 1, v: 191 },
          ],
        },
      },
    },
    {
      id: "hero-title",
      keyframes: {
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.15, v: 1, ease: "power2.out" },
            { p: 0.8, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
        y: {
          stops: [
            { p: 0, v: 120 },
            { p: 0.25, v: 0, ease: "power2.out" },
            { p: 0.75, v: 0 },
            { p: 1, v: -120, ease: "power2.in" },
          ],
        },
        scaleX: {
          stops: [
            { p: 0, v: 1.25 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 0.75, v: 1 },
            { p: 1, v: 0.8, ease: "power2.in" },
          ],
        },
        scaleY: {
          stops: [
            { p: 0, v: 1.25 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 0.75, v: 1 },
            { p: 1, v: 0.8, ease: "power2.in" },
          ],
        },
      },
    },
    {
      id: "card-left",
      keyframes: {
        x: {
          stops: [
            { p: 0, v: "-100vw" },
            { p: 0.35, v: 0, ease: "back.out(1.2)" },
            { p: 0.75, v: 0 },
            { p: 1, v: "-100vw", ease: "power2.in" },
          ],
        },
        rotation: {
          stops: [
            { p: 0, v: -8 },
            { p: 0.35, v: 0, ease: "back.out(1.2)" },
            { p: 0.75, v: 0 },
            { p: 1, v: -8, ease: "power2.in" },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.3, v: 1, ease: "power2.out" },
            { p: 0.75, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
      },
    },
    {
      id: "card-right",
      keyframes: {
        x: {
          stops: [
            { p: 0, v: "100vw" },
            { p: 0.42, v: 0, ease: "back.out(1.2)" },
            { p: 0.78, v: 0 },
            { p: 1, v: "100vw", ease: "power2.in" },
          ],
        },
        rotation: {
          stops: [
            { p: 0, v: 8 },
            { p: 0.42, v: 0, ease: "back.out(1.2)" },
            { p: 0.78, v: 0 },
            { p: 1, v: 8, ease: "power2.in" },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.37, v: 1, ease: "power2.out" },
            { p: 0.78, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
      },
    },
    {
      id: "stats-card",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 160 },
            { p: 0.3, v: 0, ease: "power2.out" },
            { p: 0.8, v: 0 },
            { p: 1, v: 160, ease: "power2.in" },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 0.8, v: 1 },
            { p: 1, v: 0, ease: "power2.in" },
          ],
        },
        "--neon-opacity": {
          stops: [
            { p: 0, v: 1 },
            { p: 0.28, v: 1 },
            { p: 0.29, v: 0.1, ease: "none" },
            { p: 0.31, v: 1, ease: "none" },
            { p: 0.48, v: 1 },
            { p: 0.49, v: 0.3, ease: "none" },
            { p: 0.51, v: 1, ease: "none" },
            { p: 0.77, v: 1 },
            { p: 0.79, v: 0.15, ease: "none" },
            { p: 0.81, v: 1, ease: "none" },
          ],
        },
      },
    },
    {
      id: "lantern-1-wrap",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: -120 },
            { p: 0.35, v: 0, ease: "back.out(1.8)" },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.25, v: 1, ease: "power2.out" },
            { p: 1, v: 1 },
          ],
        },
      },
    },
    {
      id: "lantern-2-wrap",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: -150 },
            { p: 0.42, v: 0, ease: "back.out(1.8)" },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.3, v: 1, ease: "power2.out" },
            { p: 1, v: 1 },
          ],
        },
      },
    },
    {
      id: "lantern-3-wrap",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: -100 },
            { p: 0.38, v: 0, ease: "back.out(1.8)" },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 0.28, v: 1, ease: "power2.out" },
            { p: 1, v: 1 },
          ],
        },
      },
    },
  ],
};

const lanternBounceScene = {
  id: "lantern-bounce",
  trigger: { type: "time", duration: 1.2, repeat: -1, yoyo: true },
  tracks: [
    {
      id: "lantern-1",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -18, ease: "power1.inOut" },
          ],
        },
      },
    },
    {
      id: "lantern-2",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -12, ease: "power1.inOut" },
          ],
        },
      },
    },
    {
      id: "lantern-3",
      keyframes: {
        y: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: -20, ease: "power1.inOut" },
          ],
        },
      },
    },
  ],
};

const pmProject = {
  schemaVersion: 4,
  projectId: "pasar-malam-page",
  perspective: 800,
  motions: [pasarMalamScene, lanternBounceScene],
};

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

const BOUNCE_CONFIG = { autoplay: false };

export default function PasarMalamPage() {
  const [bouncing, setBouncing] = useState(false);
  const bouncingRef = useRef(false);

  const isLoaded = useMotionProject(pmProject);
  const { refs, instance: storytellingInstance } = useScrollMotion(
    isLoaded ? pasarMalamScene : null,
  );
  const { instance: bounceInstance } = useTimeMotion(
    isLoaded ? "lantern-bounce" : null,
    BOUNCE_CONFIG,
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
            real-time DOM counters running completely outside of React's render
            loop for maximum performance.
          </p>
          <div className="pm-scroll-badge">Scroll Up to Replay</div>
        </div>
      </section>
    </div>
  );
}
