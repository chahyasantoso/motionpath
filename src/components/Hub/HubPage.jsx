import React from 'react';
import { Link } from 'react-router-dom';
import './HubPage.css';

const DEMOS = [
  {
    id: 'hooks-demo',
    title: 'Core Hooks Demo',
    badge: 'Scroll Scrub / Stagger',
    path: '/hooks-demo',
    icon: '🚀',
    color: 'glow-blue',
    description: 'A rocket follows a continuous 2D cubic Bezier path. Scrolling down staggers cards along complex Bezier/Helix layouts using native DOM updates and zero React re-renders.',
    features: ['2D Bezier Path Guide', 'Helix Spiral projection', 'Engine-level Stagger offset']
  },
  {
    id: 'burst',
    title: 'Strawberry Burst',
    badge: '3D Projection / Scrub + Obs',
    path: '/burst',
    icon: '🍓',
    color: 'glow-pink',
    description: 'A multi-scene orchestration combining scroll-scrubbed 3D Z-depth strawberry particle explosion with scroll-observer triggered centerpiece content.',
    features: ['3D Z-Depth coordinates', 'Scroll observer auto-play', 'GSAP-driven viewport triggers']
  },
  {
    id: 'motorcycle',
    title: 'Motorcycle Ride',
    badge: 'Time Trigger / Loop',
    path: '/moto',
    icon: '🏍️',
    color: 'glow-amber',
    description: 'Smooth timeline looping animation. A motorcycle rides along an S-curve road with dynamic auto-rotation, layered shadows, moving clouds, and speed streaks.',
    features: ['Path-aligned autoRotate', 'Infinite looping timeline', 'Staggered parallax effects']
  },
  {
    id: 'pasarmalam',
    title: 'Night Market (Scrub)',
    badge: 'Image Sequence / Scrub',
    path: '/pasarmalam',
    icon: '🏮',
    color: 'glow-red',
    description: 'An immersive night market journey. Scans through an optimized 30-frame image sequence with scroll-linked interpolation, custom overlay text, and ambient lantern floating.',
    features: ['Scroll-scrubbed image frames', 'Smooth wheel scrolling hook', 'Ambient play/pause toggles']
  },
  {
    id: 'pasarmalam-observer',
    title: 'Night Market (Observer)',
    badge: 'Scroll Observer / Timeline',
    path: '/pasarmalam-observer',
    icon: '👁️',
    color: 'glow-purple',
    description: 'The same night market experience, powered by a scroll observer trigger that triggers state-based animations and transitions when sections cross the viewport.',
    features: ['ScrollTrigger toggleActions', 'Viewport entry triggers', 'Separated timeline controller']
  },
  {
    id: 'tower-defense',
    title: 'Tower Defense Game',
    badge: 'Delegate / Overrides Game Loop',
    path: '/tower-defense',
    icon: '🗼',
    color: 'glow-amber',
    description: 'A pure, V2 resolveMotion-powered game loop tower defense. Enemies follow S-curves synchronously while energy projectile arcs are dynamically resolved and updated via overrides.',
    features: ['Tween-cached coordinate lookup', 'Dynamic coordinate overrides', 'Time-triggered autonomous pulse']
  },
  {
    id: 'spike-refresh',
    title: 'Performance Spike',
    badge: 'Stress Test / Benchmark',
    path: '/spike-refresh',
    icon: '⚡',
    color: 'glow-green',
    description: 'A technical benchmark validating the engine\'s limits. Updates hundreds of elements at 60fps on high-frequency scrolling, testing container destruction and recreation.',
    features: ['Component mount benchmark', 'Destroy/recreate lifecycle', 'Direct ref subscription performance']
  }
];

export default function HubPage() {
  return (
    <div className="hub-container">
      {/* Stars background overlay */}
      <div className="hub-stars" />

      {/* Hero Header */}
      <header className="hub-hero">
        <div className="hub-hero-badge">MOTIONPATH ENGINE V2</div>
        <h1 className="hub-title">
          Declarative <span className="gradient-text">Fluid Motion</span>
        </h1>
        <p className="hub-subtitle">
          GSAP-backed pub/sub animations for React with zero-cost re-renders, 
          robust validation schemas, and agnostic compose rendering.
        </p>
      </header>

      {/* Tech Specs Summary Section */}
      <section className="hub-specs">
        <div className="spec-card">
          <h3>⚡ 60 FPS Performance</h3>
          <p>Bypasses React rendering cycles. Proxied animation values stream directly to DOM refs via clean pub/sub channels.</p>
        </div>
        <div className="spec-card">
          <h3>🛡️ Strict Validation</h3>
          <p>A multi-phase validator catches layout errors, stagger misconfigurations, and ease collisions before runtime execution.</p>
        </div>
        <div className="spec-card">
          <h3>📐 Agnostic Compose</h3>
          <p>Separates GSAP state from layout styles. Composes custom filters, 3D matrices, and CSS variables on any rendering target.</p>
        </div>
      </section>

      {/* Main Grid Catalog */}
      <main className="hub-catalog">
        <h2 className="catalog-title">Explore Interactive Demos</h2>
        <div className="hub-grid">
          {DEMOS.map((demo) => (
            <div key={demo.id} className={`demo-card ${demo.color}`}>
              <div className="demo-card-inner">
                <div className="card-header">
                  <span className="card-icon">{demo.icon}</span>
                  <span className="card-badge-type">{demo.badge}</span>
                </div>
                <h3>{demo.title}</h3>
                <p className="card-description">{demo.description}</p>
                
                <ul className="card-features">
                  {demo.features.map((feature, i) => (
                    <li key={i}>✦ {feature}</li>
                  ))}
                </ul>

                <Link to={demo.path} className="launch-btn">
                  Launch Demo <span className="btn-arrow">→</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="hub-footer">
        <p>© 2026 MotionPath Engine. Crafted with React, GSAP, and Antigravity.</p>
      </footer>
    </div>
  );
}
