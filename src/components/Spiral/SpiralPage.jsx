import { useCallback, useEffect, useRef, useState } from 'react';
import { productionEngine } from '../../engines/ProductionEngine.js';
import useMotionInstance from '../../hooks/useMotionInstance';
import useMotionProject from '../../hooks/useMotionProject';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import useSmoothScroll from '../../hooks/useSmoothScroll';
import { buildMotionPath } from '../../utils/pathUtils';
import './SpiralPage.css';
 
// ─── Spiral Config & Path ────────────────────────────────────────
const SPIRAL_CONFIG = { cx: 640, cy: 360, outerR: 340, innerR: 32, turns: 3.5 };
const BALL_COLORS = [
  '#ff6bca', '#7c5cff', '#00e5ff', '#ffb347',
  '#69ff47', '#ff4747', '#ffd700', '#b0ff47',
  '#ff69b4', '#00ffaa', '#ff8c00', '#44aaff',
];
// --- Configurable Game Constants ---
const BALL_SIZE = 50; // default size of 50px (width/height)
const BALL_SPEED = 120; // moving speed of balls in pixels per second
 
function generateSpiralPoints(cx, cy, outerR, innerR, turns, targetSegments = 200) {
  // 1. Generate high-resolution raw spiral points
  const rawSegments = 2000;
  const rawPoints = [];
  for (let i = 0; i <= rawSegments; i++) {
    const p = i / rawSegments;
    const theta = p * turns * 2 * Math.PI;
    const r = outerR - (outerR - innerR) * p;
    rawPoints.push({
      x: cx + r * Math.cos(theta - Math.PI / 2),
      y: cy + r * Math.sin(theta - Math.PI / 2),
    });
  }
 
  // 2. Compute cumulative physical distances along the raw path
  const dists = [0];
  let totalLength = 0;
  for (let i = 1; i < rawPoints.length; i++) {
    const p1 = rawPoints[i - 1];
    const p2 = rawPoints[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
    dists.push(totalLength);
  }
 
  // 3. Re-sample the path to have perfectly uniform segment spacing
  const uniformPoints = [];
  const step = totalLength / targetSegments;
 
  for (let i = 0; i <= targetSegments; i++) {
    const targetDist = i * step;
    
    let idx = 0;
    while (idx < dists.length - 1 && dists[idx + 1] < targetDist) {
      idx++;
    }
    
    const dStart = dists[idx];
    const dEnd = dists[idx + 1];
    const segmentLength = dEnd - dStart;
    const ratio = segmentLength > 0 ? (targetDist - dStart) / segmentLength : 0;
    
    const pStart = rawPoints[idx];
    const pEnd = rawPoints[idx + 1];
    
    uniformPoints.push({
      x: pStart.x + (pEnd.x - pStart.x) * ratio,
      y: pStart.y + (pEnd.y - pStart.y) * ratio,
    });
  }
 
  return uniformPoints;
}
 
const spiralPathPoints = generateSpiralPoints(
  SPIRAL_CONFIG.cx, SPIRAL_CONFIG.cy,
  SPIRAL_CONFIG.outerR, SPIRAL_CONFIG.innerR,
  SPIRAL_CONFIG.turns
);

// Calculate total physical length of the spiral path
const calculatePathLength = (points) => {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
};

const totalPathLength = calculatePathLength(spiralPathPoints);

// --- Inferred Zuma Spawner Parameters ---
const BALL_TRAVEL_SECONDS = totalPathLength / BALL_SPEED;
const SPAWN_INTERVAL_MS = (BALL_SIZE / BALL_SPEED) * 1000;
const MIN_SPAWN_PROGRESS = BALL_SIZE / totalPathLength;
 
// ─── Schemas ─────────────────────────────────────────────────────
const spiralZumaScene = {
  motionId: 'spiral-zuma',
  driver: {
    type: 'timeline',
    trigger: { type: 'time', duration: BALL_TRAVEL_SECONDS },
  },
  tracks: [{
    id: 'ball-track',
    keyframes: {
      path: {
        points: spiralPathPoints,
        stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: 'none' }],
      },
      opacity: {
        stops: [
          { p: 0.0, v: 0 },
          { p: 0.05, v: 1 },
          { p: 0.88, v: 1 },
          { p: 1.0,  v: 0 },
        ],
      },
      '--ball-size': {
        stops: [
          { p: 0, v: `${BALL_SIZE}px` },
          { p: 1, v: `${BALL_SIZE}px` }
        ]
      }
    },
  }],
};
 
const ballExitScene = {
  motionId: 'ball-exit',
  driver: {
    type: 'timeline',
    trigger: { type: 'time', autoplay: false, duration: 0.35 },
  },
  tracks: [{
    id: 'ball-exit-track',
    keyframes: {
      scale:   { stops: [{ p: 0, v: 1 }, { p: 0.35, v: 1.7 }, { p: 1, v: 0 }] },
      opacity: { stops: [{ p: 0, v: 1 }, { p: 0.5,  v: 0.9 }, { p: 1, v: 0 }] },
      '--ball-size': {
        stops: [
          { p: 0, v: `${BALL_SIZE}px` },
          { p: 1, v: `${BALL_SIZE}px` }
        ]
      }
    },
  }],
};
 
const spiralContainerScene = {
  motionId: 'spiral-container',
  stagger: SPAWN_INTERVAL_MS / 1000,
  staggerTransition: { duration: 0.55, ease: 'power2.out' },
  driver: {
    type: 'timeline',
    trigger: { type: 'time', autoplay: true }
  },
  tracks: [{
    id: 'keepalive',
    duration: 1,
    keyframes: {
      opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 0 }] }
    }
  }]
};
 
const project = {
  schemaVersion: 2,
  projectId: 'spiral-zuma-page',
  perspective: 1200,
  motions: [
    spiralContainerScene,
    spiralZumaScene,
    ballExitScene,
  ]
};
 
// ─── SpiralBall Component ────────────────────────────────────────
function SpiralBall({ instance, ballData, onClickRemove, onAutoRemove }) {
  const ref = useRef(null);
  const [activeInstance, setActiveInstance] = useState(instance);
  const [activeTrackId, setActiveTrackId] = useState('ball-track');
  const isRemoving = useRef(false);
 
  const transform = useCallback((rawData, composeFn) => {
    if (activeTrackId === 'ball-exit-track') return composeFn(rawData);
 
    const p = rawData.pathProgress ?? 0;
    if (p <= 0 || p >= 1) return { display: 'none', opacity: 0 };
 
    const composed = composeFn(rawData);
 
    return { ...composed, display: 'flex' };
  }, [activeTrackId]);
 
  useMotionSubscriber(activeInstance, activeTrackId, ref, transform);
 
  // Auto-dispose when ball completes its path into the black hole
  useEffect(() => {
    if (!instance) return;
    instance.onComplete(() => {
      if (isRemoving.current) return;
      isRemoving.current = true;
      onAutoRemove(ballData.id, instance);
    });
  }, [instance, ballData.id, onAutoRemove]);
 
  const handleClick = useCallback(() => {
    if (activeTrackId === 'ball-exit-track' || isRemoving.current) return;
    isRemoving.current = true;
 
    const exitInstance = productionEngine.mountInstance('ball-exit');
    if (!exitInstance) {
      onClickRemove(ballData.id, instance);
      return;
    }
 
    setActiveInstance(exitInstance);
    setActiveTrackId('ball-exit-track');
    exitInstance.play();
    exitInstance.onComplete(() => {
      exitInstance.destroy();
      onClickRemove(ballData.id, instance);
    });
  }, [activeTrackId, instance, ballData.id, onClickRemove]);
 
  return (
    <div
      ref={ref}
      className="element spiral-ball"
      onClick={handleClick}
      style={{ '--ball-color': ballData.color }}
    />
  );
}
 
// ─── SpiralPage Component ────────────────────────────────────────
export default function SpiralPage() {
  const isLoaded = useMotionProject(project);
  useSmoothScroll();
 
  const containerInstance = useMotionInstance(isLoaded ? 'spiral-container' : null);
 
  const [balls, setBalls] = useState([]);
  const ballInstancesMap = useRef(new Map()); // ballId -> MotionInstance
  const ballCounter = useRef(0);
  const spawnedCount = useRef(0);
 
  // Silent remove: ball reached black hole, smooth reflow via staggerTransition
  const handleAutoRemove = useCallback((ballId, ballInstance) => {
    if (containerInstance) {
      containerInstance.removeChild(ballInstance);
    }
    ballInstancesMap.current.delete(ballId);
    setBalls(prev => prev.filter(b => b.id !== ballId));
  }, [containerInstance]);
 
  // Click remove: play exit animation first (handled in SpiralBall), then reflow siblings
  const handleClickRemove = useCallback((ballId, ballInstance) => {
    if (containerInstance) {
      containerInstance.removeChild(ballInstance);
    }
    ballInstancesMap.current.delete(ballId);
    setBalls(prev => prev.filter(b => b.id !== ballId));
  }, [containerInstance]);
 
  // Spawn a new ball by adding it to the parent container
  const addBall = useCallback(() => {
    if (!isLoaded || !containerInstance) return;
    const ballInstance = containerInstance.addChild('spiral-zuma');
    if (!ballInstance) return;
 
    ballCounter.current += 1;
    const id = ballCounter.current;
 
    ballInstancesMap.current.set(id, ballInstance);
    setBalls(prev => [...prev, {
      id,
      color: BALL_COLORS[id % BALL_COLORS.length],
    }]);
  }, [isLoaded, containerInstance]);
 
  // Listen for children changes in the parent timeline to reset the wave when all balls are gone
  useEffect(() => {
    if (!containerInstance) return;
 
    const unsubscribe = containerInstance.onChildChange(() => {
      // If all children have been removed, reset the wave count and play parent timeline from 0
      console.log('Child changed', containerInstance.children.length, spawnedCount.current);
      if (containerInstance.children.length === 0 && spawnedCount.current > 0) {
        spawnedCount.current = 0;
        containerInstance.timeline.play(0);
        console.log('All balls removed, resetting wave');
      }
    });
 
    return () => {
      unsubscribe();
    };
  }, [containerInstance]);
 
  // Auto-spawn: spawn a wave of 30 balls, then pause (using native requestAnimationFrame)
  useEffect(() => {
    if (!isLoaded || !containerInstance) return;
 
    let rafId;
 
    // unspawn: identify and remove balls that reach the black hole
    const checkAndUnspawnCompletedBalls = () => {
      ballInstancesMap.current.forEach((inst, id) => {
        if (inst.timeline.progress() >= 0.999) {
          handleAutoRemove(id, inst);
        }
      });
    };
 
    // spawn: launch new balls based on progress spacing
    const handleSpawningNewBalls = () => {
      if (spawnedCount.current < 30) {
        const lastId = ballCounter.current;
        const lastInstance = ballInstancesMap.current.get(lastId);
        if (!lastInstance || lastInstance.timeline.progress() >= MIN_SPAWN_PROGRESS) {
          addBall();
          spawnedCount.current += 1;
        }
      }
    };
 
    const tick = () => {
      checkAndUnspawnCompletedBalls();
      handleSpawningNewBalls();
      rafId = requestAnimationFrame(tick);
    };
 
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      ballInstancesMap.current.clear();
      spawnedCount.current = 0;
    };
  }, [addBall, handleAutoRemove, isLoaded, containerInstance]);
 
  return (
    <div className="app zuma-app">
      <header className="header zuma-header">
        <h1>Zuma <span className="spiral-accent">Spiral Flow</span></h1>
        <p className="subtitle">Time-Driven Physics • Stagger Parent • Built-in Native Reflow</p>
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
              d={buildMotionPath(spiralPathPoints)}
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
 
          {balls.map(ball => {
            const ballInstance = ballInstancesMap.current.get(ball.id);
            if (!ballInstance) return null;
            return (
              <SpiralBall
                key={ball.id}
                instance={ballInstance}
                ballData={ball}
                onClickRemove={handleClickRemove}
                onAutoRemove={handleAutoRemove}
              />
            );
          })}
        </div>
      </section>
 
      <footer className="footer zuma-footer">
        <p>© 2026 MotionPath Zuma Demo</p>
      </footer>
    </div>
  );
}
