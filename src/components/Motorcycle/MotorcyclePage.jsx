import React, { useCallback, useRef } from 'react';
import useMotionProject from '../../hooks/useMotionProject';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import { buildMotionPath } from '../../lib/pathUtils';
import './MotorcyclePage.css';

// ─── Path Data ────────────────────────────────────────────────────
// S-curve road: viewport-relative coords (0..1280 x 0..600)
const roadNodes = [
  { x: -80,  y: 500 },
  { x: 280,  y: 360, ctrlX: 60,   ctrlY: 560 },
  { x: 640,  y: 240, ctrlX: 480,  ctrlY: 180 },
  { x: 960,  y: 140, ctrlX: 800,  ctrlY: 310 },
  { x: 1380, y: 70,  ctrlX: 1120, ctrlY: 30  },
];

// Shadow is offset 22px below the main path
const shadowNodes = roadNodes.map(n => ({
  ...n,
  y: n.y + 22,
  ...(n.ctrlY !== undefined ? { ctrlY: n.ctrlY + 22 } : {}),
}));



// Cloud paths (independent, slower visual layers)
const cloudANodes = [{ x: -240, y: 90 }, { x: 1400, y: 80 }];

const cloudBNodes = [{ x: -240, y: 140 }, { x: 1400, y: 120 }];

// Speed streak paths (horizontal, bottom half)
const streakANodes = [{ x: -400, y: 510 }, { x: 1400, y: 510 }];

const streakBNodes = [{ x: -400, y: 470 }, { x: 1400, y: 470 }];

// ─── Project Schema ───────────────────────────────────────────────
const RIDE_DURATION = 5; // seconds end-to-end

const project = {
  schemaVersion: 1,
  projectId: 'motorcycle-page',
  scenarios: [
    // Main bike along the S-curve
    {
      sceneId: 'moto-bike-scene',
      trigger: { type: 'time', duration: RIDE_DURATION, repeat: -1, yoyo: false },
      elements: [
        {
          id: 'moto-bike',
          keyframes: {
            path: {
              points: roadNodes,
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
              autoRotate: true,
            },
            opacity: {
              stops: [
                { p: 0.00, v: 0 },
                { p: 0.04, v: 1 },
                { p: 0.92, v: 1 },
                { p: 1.00, v: 0 },
              ],
            },
          },
        },
      ],
    },
    // Shadow — same path, offset, slight lag via stagger
    {
      sceneId: 'moto-shadow-scene',
      trigger: { type: 'time', duration: RIDE_DURATION, repeat: -1, yoyo: false },
      elements: [
        {
          id: 'moto-shadow',
          keyframes: {
            path: {
              points: shadowNodes,
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
              autoRotate: true,
            },
            opacity: {
              stops: [
                { p: 0.00, v: 0 },
                { p: 0.05, v: 0.35 },
                { p: 0.92, v: 0.35 },
                { p: 1.00, v: 0 },
              ],
            },
          },
        },
      ],
    },
    // Clouds
    {
      sceneId: 'moto-clouds-scene',
      trigger: { type: 'time', duration: RIDE_DURATION * 1.8, repeat: -1, yoyo: false },
      elements: [
        {
          id: 'moto-cloud-a',
          keyframes: {
            path: {
              points: cloudANodes,
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
            },
          },
        },
        {
          id: 'moto-cloud-b',
          keyframes: {
            path: {
              points: cloudBNodes,
              stops: [{ p: 0, v: 0.22 }, { p: 1, v: 1 }],
            },
            opacity: {
              stops: [
                { p: 0.00, v: 0 },
                { p: 0.24, v: 0.55 },
                { p: 0.85, v: 0.55 },
                { p: 1.00, v: 0 },
              ],
            },
          },
        },
      ],
    },
    // Speed streaks
    {
      sceneId: 'moto-streaks-scene',
      trigger: { type: 'time', duration: RIDE_DURATION * 0.9, repeat: -1, yoyo: false },
      elements: [
        {
          id: 'moto-streak-a',
          keyframes: {
            path: {
              points: streakANodes,
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
            },
            opacity: {
              stops: [
                { p: 0.00, v: 0 },
                { p: 0.05, v: 0.55 },
                { p: 0.88, v: 0.55 },
                { p: 1.00, v: 0 },
              ],
            },
          },
        },
        {
          id: 'moto-streak-b',
          keyframes: {
            path: {
              points: streakBNodes,
              stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
            },
            opacity: {
              stops: [
                { p: 0.00, v: 0 },
                { p: 0.08, v: 0.35 },
                { p: 0.88, v: 0.35 },
                { p: 1.00, v: 0 },
              ],
            },
          },
        },
      ],
    },
  ],
};

// ─── Subscriber Components ─────────────────────────────────────────

function Bike() {
  const ref = useRef(null);
  // Scale up slightly as the bike accelerates across the screen
  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    const t = rawData.pathProgress ?? 0;
    const scale = 0.65 + t * 0.55;
    return { ...composed, scale };
  }, []);
  useMotionSubscriber('moto-bike', ref, transform);
  return (
    <div ref={ref} className="moto-element moto-bike">
      🏍️
    </div>
  );
}

function BikeShadow() {
  const ref = useRef(null);
  const transform = useCallback((rawData, composeFn) => {
    const composed = composeFn(rawData);
    const t = rawData.pathProgress ?? 0;
    const scale = 0.5 + t * 0.4;
    return { ...composed, scale, scaleY: 0.28, skewX: -18, blur: 2 };
  }, []);
  useMotionSubscriber('moto-shadow', ref, transform);
  return (
    <div ref={ref} className="moto-element moto-shadow">
      🏍️
    </div>
  );
}

function MotoCloud({ elementId, label }) {
  const ref = useRef(null);
  const transform = useCallback((rawData, composeFn) => composeFn(rawData), []);
  useMotionSubscriber(elementId, ref, transform);
  return (
    <div ref={ref} className="moto-element moto-cloud">
      {label}
    </div>
  );
}

function Streak({ elementId, className }) {
  const ref = useRef(null);
  const transform = useCallback((rawData, composeFn) => composeFn(rawData), []);
  useMotionSubscriber(elementId, ref, transform);
  return (
    <div
      ref={ref}
      className={`moto-element moto-streak ${className}`}
    />
  );
}

// ─── Page ──────────────────────────────────────────────────────────

export default function MotorcyclePage() {
  useMotionProject(project);

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
        <p className="moto-tagline">Time-based · Bézier Path · Direct DOM · 60 FPS</p>
      </header>

      {/* Stage — full viewport, all positioned relative to it */}
      <div className="moto-stage">

        {/* Background atmosphere */}
        <div className="orb orb-orange" />
        <div className="orb orb-purple" />
        <div className="orb orb-gold" />

        {/* Road SVG overlay */}
        <svg className="road-svg" viewBox="0 0 1280 600" preserveAspectRatio="none">
          <path d={shadowSvgD}   className="road-edge"   />
          <path d={roadSvgD}     className="road-glow"   />
          <path d={roadSvgD}     className="road-dashes" strokeDasharray="28 18" />
        </svg>

        {/* Animated elements */}
        <Streak elementId="moto-streak-a" className="streak-a" />
        <Streak elementId="moto-streak-b" className="streak-b" />
        <MotoCloud elementId="moto-cloud-a" label="☁️" />
        <MotoCloud elementId="moto-cloud-b" label="☁️" />
        <BikeShadow />
        <Bike />

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
        Built with <code>useMotionProject</code> + <code>useMotionSubscriber</code>
      </footer>
    </div>
  );
}
