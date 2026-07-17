import { useMemo } from 'react';
import useMotionInstance from '../../hooks/useMotionInstance';
import useMotionProject from '../../hooks/useMotionProject';
import useSmoothScroll from '../../hooks/useSmoothScroll';
import { buildMotionPath } from '../../utils/pathUtils';
import SpiralBall from './SpiralBall.jsx';
import { BALL_SIZE, SPIRAL_CONFIG } from './spiralConfig.js';
import { createSpiralProject } from './spiralMotions.js';
import './SpiralPage.css';
import { BALL_TRAVEL_SECONDS, SPAWN_INTERVAL_MS, spiralPathPoints } from './spiralPath.js';
import { useSpiralPageViewModel } from './useSpiralPageViewModel.js';

export default function SpiralPage() {
  const project = useMemo(() => createSpiralProject({
    spiralPathPoints,
    ballTravelSeconds: BALL_TRAVEL_SECONDS,
    ballSize: BALL_SIZE,
    spawnIntervalMs: SPAWN_INTERVAL_MS,
  }), []);

  const isLoaded = useMotionProject(project);
  useSmoothScroll();

  const containerInstance = useMotionInstance(isLoaded ? 'spiral-container' : null);
  const vm = useSpiralPageViewModel({ isLoaded, containerInstance });

  return (
    <div className="app zuma-app">
      <header className="header zuma-header">
        <h1>Zuma <span className="spiral-accent">{vm.title.split(' ').slice(1).join(' ')}</span></h1>
        <p className="subtitle">{vm.subtitle}</p>
      </header>

      <section className="spiral-scene">
        <div className="scene-label">
          <h2>Endless Spiral <span className="spiral-accent">· Zuma Flow</span></h2>
          <p>
            Balls auto-spawn from the outer edge and spiral into the black hole. Click any ball to pop it — siblings slide smoothly to fill the gap.
          </p>
        </div>

        <div className="spiral-stage">
          <svg className="path-guide" width="100%" height="100%" aria-hidden="true">
            <defs>
              <radialGradient id="blackhole-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#000000" />
                <stop offset="55%"  stopColor="#1a0033" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="hole-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#7c5cff" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Spiral path guide */}
            <path
              d={buildMotionPath(vm.spiralPathPoints)}
              fill="none"
              stroke="rgba(124, 92, 255, 0.3)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />

            {/* Black hole — ambient glow */}
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={90} fill="url(#blackhole-glow)" />
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={55} fill="url(#hole-core)" />

            {/* Event horizon rings */}
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={56} fill="none" stroke="rgba(124,92,255,0.08)"  strokeWidth="1" />
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={44} fill="none" stroke="rgba(124,92,255,0.16)"  strokeWidth="1.5" />
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={32} fill="none" stroke="rgba(124,92,255,0.40)"  strokeWidth="2" />

            {/* Singularity */}
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={28} fill="#000000" />
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={10} fill="rgba(124,92,255,0.55)" />
            <circle cx={SPIRAL_CONFIG.cx} cy={SPIRAL_CONFIG.cy} r={4}  fill="rgba(200,160,255,0.9)" />
          </svg>

          {vm.balls.map(ballVm => (
            <SpiralBall key={ballVm.id} vm={ballVm} />
          ))}
        </div>
      </section>

      <footer className="footer zuma-footer">
        <p>© 2026 MotionPath Zuma Demo</p>
      </footer>
    </div>
  );
}
