import React, { useState, useEffect, useRef, useCallback } from 'react';
import useMotionProject from '../../hooks/useMotionProject';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import productionEngine from '../../lib/ProductionEngine';
import './TowerDefensePage.css';

// ─── Game Constants ─────────────────────────────────────────────
const STAGE_WIDTH = 900;
const STAGE_HEIGHT = 500;
const TOWER_RANGE = 180;
const FIRE_COOLDOWN = 60; // frames (approx 1s at 60fps)
const WAVE_ENEMY_COUNT = 6;
const PROJECTILE_SPEED = 0.04; // progress step per frame

const TOWERS_CONFIG = [
  { id: 'tower-1', x: 220, y: 250, name: 'Arc Cannon', color: '#00f2fe', cooldown: 0 },
  { id: 'tower-2', x: 450, y: 220, name: 'Plasma Spire', color: '#ff6bcb', cooldown: 0 },
  { id: 'tower-3', x: 680, y: 270, name: 'Quantum Ray', color: '#f5a623', cooldown: 0 }
];

const ENEMY_TYPES = {
  crawler: { hp: 3, speed: 0.002, emoji: '👾', name: 'Crawler' },
  scout: { hp: 2, speed: 0.0035, emoji: '🛸', name: 'Scout' },
  goliath: { hp: 10, speed: 0.001, emoji: '🤖', name: 'Goliath' }
};

// ─── Motion Engine Schemas ──────────────────────────────────────
const lane1Path = {
  motionId: 'lane-1-path',
  driver: { type: 'delegate' },
  tracks: [
    {
      id: 'lane-1-track',
      keyframes: {
        path: {
          points: [
            { x: 0, y: 150 },
            { x: 220, y: 80, ctrlX: 110, ctrlY: 30 },
            { x: 450, y: 380, ctrlX: 320, ctrlY: 420 },
            { x: 680, y: 120, ctrlX: 580, ctrlY: 100 },
            { x: 900, y: 200, ctrlX: 800, ctrlY: 280 }
          ],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
          autoRotate: true
        }
      }
    }
  ]
};

const lane2Path = {
  motionId: 'lane-2-path',
  driver: { type: 'delegate' },
  tracks: [
    {
      id: 'lane-2-track',
      keyframes: {
        path: {
          points: [
            { x: 0, y: 350 },
            { x: 220, y: 420, ctrlX: 110, ctrlY: 470 },
            { x: 450, y: 120, ctrlX: 320, ctrlY: 80 },
            { x: 680, y: 380, ctrlX: 580, ctrlY: 400 },
            { x: 900, y: 300, ctrlX: 800, ctrlY: 220 }
          ],
          stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }],
          autoRotate: true
        }
      }
    }
  ]
};

const projectileArc = {
  motionId: 'projectile-arc',
  driver: { type: 'delegate' },
  tracks: [
    {
      id: 'proj-track',
      keyframes: {
        x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
        y: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
        scale: { stops: [{ p: 0, v: 0.5 }, { p: 0.2, v: 1.3 }, { p: 1, v: 0.7 }] },
        opacity: { stops: [{ p: 0, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }] }
      }
    }
  ]
};

const towerPulse = {
  motionId: 'tower-pulse-motion',
  driver: {
    type: 'timeline',
    trigger: { type: 'time', duration: 1.6, repeat: -1 }
  },
  tracks: [
    {
      id: 'tower-pulse-ring',
      keyframes: {
        scale: { stops: [{ p: 0, v: 0.5 }, { p: 0.8, v: 1.8 }, { p: 1, v: 0.5 }] },
        opacity: { stops: [{ p: 0, v: 0.6 }, { p: 0.8, v: 0 }, { p: 1, v: 0.6 }] }
      }
    }
  ]
};

const project = {
  schemaVersion: 2,
  projectId: 'tower-defense-game',
  motions: [lane1Path, lane2Path, projectileArc, towerPulse]
};

// ─── Sub-Component for Tower Ambient Animation ─────────────────
function TowerRing({ towerId }) {
  const ref = useRef(null);

  // Subscribe to time-triggered tower pulse
  useMotionSubscriber('tower-pulse-ring', ref, useCallback((rawData, composeFn) => {
    return composeFn(rawData);
  }, []));

  return <div ref={ref} className="tower-pulse-ring" />;
}

// ─── Main Game Page Export ──────────────────────────────────────
export default function TowerDefensePage() {
  // Load Project Schemas into V2 Production Engine
  useMotionProject(project);

  const [gameState, setGameState] = useState('idle'); // idle, playing, won, gameover
  const [wave, setWave] = useState(0);
  const [lives, setLives] = useState(20);
  const [score, setScore] = useState(0);

  // Use refs for gameplay variables to prevent re-render thrashing the RAF loop
  const gameLoopRef = useRef(null);
  const enemiesRef = useRef([]);
  const projectilesRef = useRef([]);
  const towersRef = useRef(TOWERS_CONFIG.map(t => ({ ...t })));
  const nextEnemyIdRef = useRef(1);
  const nextProjIdRef = useRef(1);
  const waveEnemyCountRef = useRef(0);
  const waveSpawnTimerRef = useRef(0);

  // UI state for reactive counts (only updated periodically/when important)
  const [uiEnemies, setUiEnemies] = useState([]);
  const [uiProjectiles, setUiProjectiles] = useState([]);

  const resetGame = () => {
    enemiesRef.current = [];
    projectilesRef.current = [];
    towersRef.current = TOWERS_CONFIG.map(t => ({ ...t }));
    nextEnemyIdRef.current = 1;
    nextProjIdRef.current = 1;
    waveEnemyCountRef.current = 0;
    waveSpawnTimerRef.current = 0;
    setLives(20);
    setScore(0);
    setWave(0);
    setUiEnemies([]);
    setUiProjectiles([]);
    setGameState('idle');
  };

  const startNextWave = () => {
    if (gameState === 'gameover' || gameState === 'won') return;
    setWave(w => w + 1);
    waveEnemyCountRef.current = WAVE_ENEMY_COUNT + wave * 2;
    waveSpawnTimerRef.current = 0;
    setGameState('playing');
  };

  // Main Game Loop (V2 pure coordinate resolution)
  const updateGame = () => {
    if (gameState !== 'playing') {
      gameLoopRef.current = requestAnimationFrame(updateGame);
      return;
    }

    // 1. Spawning
    if (waveEnemyCountRef.current > 0) {
      waveSpawnTimerRef.current++;
      if (waveSpawnTimerRef.current >= 80) { // spawn every ~1.3s
        waveSpawnTimerRef.current = 0;
        waveEnemyCountRef.current--;

        const lane = Math.random() > 0.5 ? 1 : 2;
        const types = ['crawler', 'scout'];
        if (wave > 2) types.push('goliath');
        const typeKey = types[Math.floor(Math.random() * types.length)];
        const baseType = ENEMY_TYPES[typeKey];

        enemiesRef.current.push({
          id: nextEnemyIdRef.current++,
          lane,
          type: typeKey,
          emoji: baseType.emoji,
          maxHp: baseType.hp,
          hp: baseType.hp,
          speed: baseType.speed * (1 + wave * 0.1), // slightly faster each wave
          progress: 0,
          x: 0,
          y: lane === 1 ? 150 : 350,
          rotation: 0
        });
      }
    }

    // 2. Enemy Motion Path Evaluation via V2 Motion Engine
    const currentEnemies = enemiesRef.current;
    const remainingEnemies = [];

    for (let enemy of currentEnemies) {
      enemy.progress += enemy.speed;

      if (enemy.progress >= 1.0) {
        // Leaked - lose a life
        setLives(l => {
          const nextLives = l - 1;
          if (nextLives <= 0) setGameState('gameover');
          return nextLives;
        });
        continue;
      }

      // Query coordinates from the productionEngine using V2 resolveMotion
      try {
        const laneId = `lane-${enemy.lane}-path`;
        const result = productionEngine.resolveMotion(laneId, enemy.progress);
        const trackId = `lane-${enemy.lane}-track`;
        
        if (result && result[trackId]) {
          enemy.x = result[trackId].x;
          enemy.y = result[trackId].y;
          enemy.rotation = result[trackId].rotation || 0;
        }
      } catch (err) {
        console.error('resolveMotion error for enemy:', err);
      }

      remainingEnemies.push(enemy);
    }
    enemiesRef.current = remainingEnemies;

    // 3. Tower Defense Fire Targeting
    for (let tower of towersRef.current) {
      if (tower.cooldown > 0) {
        tower.cooldown--;
        continue;
      }

      // Target first enemy within range
      const inRangeEnemy = enemiesRef.current.find(enemy => {
        const dx = enemy.x - tower.x;
        const dy = enemy.y - tower.y;
        return Math.sqrt(dx * dx + dy * dy) <= TOWER_RANGE;
      });

      if (inRangeEnemy) {
        // Fire projectile
        projectilesRef.current.push({
          id: nextProjIdRef.current++,
          towerId: tower.id,
          targetId: inRangeEnemy.id,
          startX: tower.x,
          startY: tower.y,
          progress: 0
        });
        tower.cooldown = FIRE_COOLDOWN;
      }
    }

    // 4. Projectile Motion Resolution & Hit Logic
    const currentProjectiles = projectilesRef.current;
    const remainingProjectiles = [];

    for (let proj of currentProjectiles) {
      proj.progress += PROJECTILE_SPEED;

      // Find the current target position (homing behavior)
      const target = enemiesRef.current.find(e => e.id === proj.targetId);

      if (!target || proj.progress >= 1.0) {
        // If target was already killed or progress finished, explode
        if (target && proj.progress >= 1.0) {
          target.hp--;
          if (target.hp <= 0) {
            setScore(s => s + 10);
            enemiesRef.current = enemiesRef.current.filter(e => e.id !== target.id);
          }
        }
        continue;
      }

      // Interpolate projectile trajectory via V2 resolveMotion with overrides
      try {
        const override = {
          'proj-track': {
            keyframes: {
              x: { stops: [{ p: 0, v: proj.startX }, { p: 1, v: target.x }] },
              y: { stops: [{ p: 0, v: proj.startY }, { p: 1, v: target.y }] }
            }
          }
        };

        const result = productionEngine.resolveMotion('projectile-arc', proj.progress, override);
        
        if (result && result['proj-track']) {
          proj.x = result['proj-track'].x;
          proj.y = result['proj-track'].y;
          proj.scale = result['proj-track'].scale ?? 1;
          proj.opacity = result['proj-track'].opacity ?? 1;
        }
      } catch (err) {
        console.error('resolveMotion error for projectile:', err);
      }

      remainingProjectiles.push(proj);
    }
    projectilesRef.current = remainingProjectiles;

    // 5. Wave Completion / Win Check
    if (waveEnemyCountRef.current === 0 && enemiesRef.current.length === 0 && projectilesRef.current.length === 0) {
      if (wave >= 5) {
        setGameState('won');
      } else {
        setGameState('idle');
      }
    }

    // Force React render cycle for game objects
    setUiEnemies([...enemiesRef.current]);
    setUiProjectiles([...projectilesRef.current]);

    gameLoopRef.current = requestAnimationFrame(updateGame);
  };

  useEffect(() => {
    gameLoopRef.current = requestAnimationFrame(updateGame);
    return () => cancelAnimationFrame(gameLoopRef.current);
  }, [gameState, wave]);

  return (
    <div className="td-page">
      <div className="td-container">
        
        {/* HUD Top Bar */}
        <header className="td-hud">
          <div className="hud-metric">
            <span className="hud-label">Score</span>
            <span className="hud-val">{score}</span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">Wave</span>
            <span className="hud-val">{wave} / 5</span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">Lives</span>
            <span className="hud-val lives-val">{lives}</span>
          </div>
        </header>

        {/* Playfield Canvas */}
        <main className="td-playfield">
          {/* Wave/State Modals */}
          {gameState === 'idle' && (
            <div className="td-overlay">
              <h2>Wave {wave + 1} Ready</h2>
              <p>Pre-placed energy towers are online. Click Start to begin the assault.</p>
              <button className="td-btn" onClick={startNextWave}>Start Wave</button>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="td-overlay lose-overlay">
              <h2 className="text-red">System Offline</h2>
              <p>The defense shield failed. Score achieved: <strong>{score}</strong></p>
              <button className="td-btn btn-red" onClick={resetGame}>Restart Game</button>
            </div>
          )}

          {gameState === 'won' && (
            <div className="td-overlay win-overlay">
              <h2 className="text-green">Victory</h2>
              <p>All waves clear. Cosmic corridor secured!</p>
              <button className="td-btn btn-green" onClick={resetGame}>Play Again</button>
            </div>
          )}

          {/* SVG Guides for Lanes */}
          <svg className="td-path-svg" width={STAGE_WIDTH} height={STAGE_HEIGHT}>
            {/* Top Lane path */}
            <path
              d="M 0 150 C 110 30, 320 420, 450 380 C 580 100, 800 280, 900 200"
              fill="none"
              stroke="rgba(0, 242, 254, 0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 0 150 C 110 30, 320 420, 450 380 C 580 100, 800 280, 900 200"
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />

            {/* Bottom Lane path */}
            <path
              d="M 0 350 C 110 470, 320 80, 450 120 C 580 400, 800 220, 900 300"
              fill="none"
              stroke="rgba(255, 107, 203, 0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 0 350 C 110 470, 320 80, 450 120 C 580 400, 800 220, 900 300"
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
          </svg>

          {/* Towers Placement */}
          {towersRef.current.map(tower => (
            <div 
              key={tower.id} 
              className="td-tower-node"
              style={{ left: tower.x, top: tower.y }}
            >
              <TowerRing towerId={tower.id} />
              <div 
                className="tower-turret" 
                style={{ 
                  boxShadow: `0 0 16px ${tower.color}`,
                  borderColor: tower.color 
                }}
              >
                🗼
              </div>
              <div className="tower-meta">
                <span className="tower-name">{tower.name}</span>
                <div className="tower-range-indicator" style={{ width: TOWER_RANGE * 2, height: TOWER_RANGE * 2 }} />
              </div>
            </div>
          ))}

          {/* Render Active Enemies */}
          {uiEnemies.map(enemy => (
            <div 
              key={enemy.id} 
              className="td-enemy"
              style={{ 
                transform: `translate3d(${enemy.x}px, ${enemy.y}px, 0) rotate(${enemy.rotation}deg)` 
              }}
            >
              <div className="enemy-emoji">{enemy.emoji}</div>
              {/* HP Bar */}
              <div className="enemy-hp-bar">
                <div 
                  className="enemy-hp-fill" 
                  style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }}
                />
              </div>
            </div>
          ))}

          {/* Render Active Projectiles */}
          {uiProjectiles.map(proj => (
            <div 
              key={proj.id} 
              className="td-projectile"
              style={{ 
                transform: `translate3d(${proj.x}px, ${proj.y}px, 0) scale(${proj.scale || 1})`,
                opacity: proj.opacity || 1
              }}
            />
          ))}
        </main>
      </div>
    </div>
  );
}
