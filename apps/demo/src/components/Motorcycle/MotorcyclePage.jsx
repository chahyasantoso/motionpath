import React, { useCallback, useRef } from "react";
import useMotionProject from "@motionpath/react/useMotionProject";
import useMotionSubscriber from "@motionpath/react/useMotionSubscriber";
import useTimeMotion from "@motionpath/react/useTimeMotion";
import { buildMotionPath } from "../../utils/pathUtils";
import { motorcycleProject, roadNodes, shadowNodes } from "./motorcycleMotions";
import "./MotorcyclePage.css";

// ─── Subscriber Components ─────────────────────────────────────────

function Bike({ instance }) {
  const ref = useRef(null);
  // Scale up slightly as the bike accelerates across the screen
  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    const t = rawData.pathProgress ?? 0;
    const scale = 0.65 + t * 0.55;
    return { ...composed, scale };
  }, []);
  useMotionSubscriber(instance, "moto-bike", ref, transform);
  return (
    <div ref={ref} className="moto-element moto-bike">
      🏍️
    </div>
  );
}

function BikeShadow({ instance }) {
  const ref = useRef(null);
  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    const t = rawData.pathProgress ?? 0;
    const scale = 0.5 + t * 0.4;
    // `blur` is not a CSS property GSAP understands on its own; the filter
    // plugin only owns that key when `blur` is an authored keyframe. A
    // subscriber adding it ad hoc has to emit real CSS.
    return {
      ...composed,
      scale,
      scaleY: 0.28,
      skewX: -18,
      filter: "blur(2px)",
    };
  }, []);
  useMotionSubscriber(instance, "moto-shadow", ref, transform);
  return (
    <div ref={ref} className="moto-element moto-shadow">
      🏍️
    </div>
  );
}

function MotoCloud({ instance, trackId, label }) {
  const ref = useRef(null);
  const transform = useCallback((rawData, composeFn) => composeFn(rawData), []);
  useMotionSubscriber(instance, trackId, ref, transform);
  return (
    <div ref={ref} className="moto-element moto-cloud">
      {label}
    </div>
  );
}

function Streak({ instance, trackId, className }) {
  const ref = useRef(null);
  const transform = useCallback((rawData, composeFn) => composeFn(rawData), []);
  useMotionSubscriber(instance, trackId, ref, transform);
  return <div ref={ref} className={`moto-element moto-streak ${className}`} />;
}

// ─── Page ──────────────────────────────────────────────────────────

export default function MotorcyclePage() {
  const isLoaded = useMotionProject(motorcycleProject);

  const { instance: bikeInstance } = useTimeMotion(
    isLoaded ? "moto-bike-scene" : null,
  );
  const { instance: shadowInstance } = useTimeMotion(
    isLoaded ? "moto-shadow-scene" : null,
  );
  const { instance: cloudsInstance } = useTimeMotion(
    isLoaded ? "moto-clouds-scene" : null,
  );
  const { instance: streaksInstance } = useTimeMotion(
    isLoaded ? "moto-streaks-scene" : null,
  );

  // SVG overlay: road guide from original nodes (with ctrlX/ctrlY)
  const roadSvgD = buildMotionPath(roadNodes);
  const shadowSvgD = buildMotionPath(shadowNodes);

  return (
    <div className="moto-page">
      {/* Fixed header */}
      <header className="moto-header">
        <h1 className="moto-logo">
          MotionPath <span className="moto-accent">Ride</span>
        </h1>
        <p className="moto-tagline">
          Time-based · Bézier Path · Direct DOM · 60 FPS
        </p>
      </header>

      {/* Stage — full viewport, all positioned relative to it */}
      <div className="moto-stage">
        {/* Background atmosphere */}
        <div className="orb orb-orange" />
        <div className="orb orb-purple" />
        <div className="orb orb-gold" />

        {/* Road SVG overlay */}
        <svg
          className="road-svg"
          viewBox="0 0 1280 600"
          preserveAspectRatio="none"
        >
          <path d={shadowSvgD} className="road-edge" />
          <path d={roadSvgD} className="road-glow" />
          <path d={roadSvgD} className="road-dashes" strokeDasharray="28 18" />
        </svg>

        {/* Animated elements */}
        <Streak
          instance={streaksInstance}
          trackId="moto-streak-a"
          className="streak-a"
        />
        <Streak
          instance={streaksInstance}
          trackId="moto-streak-b"
          className="streak-b"
        />
        <MotoCloud instance={cloudsInstance} trackId="moto-cloud-a" label="☁️" />
        <MotoCloud instance={cloudsInstance} trackId="moto-cloud-b" label="☁️" />
        <BikeShadow instance={shadowInstance} />
        <Bike instance={bikeInstance} />

        {/* HUD */}
        <div className="moto-hud">
          <p className="hud-label">OPEN ROAD</p>
          <div className="hud-speed">
            <span className="hud-number">∞</span>
            <span className="hud-unit">KM/H</span>
          </div>
        </div>

        {/* Scene caption */}
        <div className="moto-caption">
          <h2>Open Road</h2>
          <p>S-curve Bézier · GSAP Time · Zero Re-renders</p>
        </div>
      </div>

      <footer className="moto-footer">
        Built with <code>useMotionProject</code> + <code>useTimeMotion</code> +{" "}
        <code>useMotionSubscriber</code>
      </footer>
    </div>
  );
}
