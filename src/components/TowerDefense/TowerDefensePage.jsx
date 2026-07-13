import { useEffect, useRef, useState } from 'react';
import useMotionInstance from '../../hooks/useMotionInstance';
import useMotionProject from '../../hooks/useMotionProject';
import useMotionSubscriber from '../../hooks/useMotionSubscriber';
import { buildMotionPath, convertToCubicPath } from '../../utils/pathUtils';
import productionEngine from '../../engines/ProductionEngine.js';
import { domRenderer } from '../../utils/domRenderer.js';
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
        path: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
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

const enemyDeath = {
  motionId: 'enemy-death',
  driver: { type: 'delegate' },
  tracks: [
    {
      id: 'death-track',
      keyframes: {
        rotation: { stops: [{ p: 0, v: 0 }, { p: 1, v: 270 }] },
        scale: { stops: [{ p: 0, v: 1 }, { p: 0.3, v: 1.4 }, { p: 1, v: 0 }] },
        opacity: { stops: [{ p: 0, v: 1 }, { p: 1, v: 0 }] }
      }
    }
  ]
};

const project = {
  schemaVersion: 2,
  projectId: 'tower-defense-game',
  motions: [lane1Path, lane2Path, projectileArc, towerPulse, enemyDeath]
};

// ─── Sub-Component for Tower Ambient Animation ─────────────────
function TowerRing({ instance, color }) {
  const ref = useRef(null);

  // Subscribe to time-triggered tower pulse
  useMotionSubscriber(instance, 'tower-pulse-ring', ref);

  return (
    <div 
      ref={ref} 
      className="tower-pulse-ring" 
      style={{ 
        borderColor: color, 
        boxShadow: `0 0 12px ${color}`
      }} 
    />
  );
}

// ─── Main Game Page Export ──────────────────────────────────────
export default function TowerDefensePage() {
  // Load Project Schemas into V2 Production Engine
  const isLoaded = useMotionProject(project);

  const pulseInstance = useMotionInstance(isLoaded ? 'tower-pulse-motion' : null);

  const [gameState, setGameState] = useState('idle'); // idle, playing, won, gameover
  const [wave, setWave] = useState(0);
  const [lives, setLives] = useState(20);
  const [score, setScore] = useState(0);

  // Keep refs in sync for the requestAnimationFrame loop to avoid stale closure issues
  const gameStateRef = useRef(gameState);
  const waveRef = useRef(wave);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    waveRef.current = wave;
  }, [wave]);

  // DOM element maps for direct rendering bypassing React
  const enemyElsRef = useRef(new Map());
  const projElsRef = useRef(new Map());

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
    enemiesRef.current.forEach(e => {
      if (e.instance) e.instance.destroy();
      if (e.deathInstance) e.deathInstance.destroy();
    });
    projectilesRef.current.forEach(p => {
      if (p.instance) p.instance.destroy();
    });
    enemiesRef.current = [];
    projectilesRef.current = [];
    towersRef.current = TOWERS_CONFIG.map(t => ({ ...t }));
    nextEnemyIdRef.current = 1;
    nextProjIdRef.current = 1;
    waveEnemyCountRef.current = 0;
    waveSpawnTimerRef.current = 0;
    enemyElsRef.current.clear();
    projElsRef.current.clear();
    setLives(20);
    setScore(0);
    setWave(0);
    setUiEnemies([]);
    setUiProjectiles([]);
    setGameState('idle');
  };

  const startNextWave = () => {
    const currentGState = gameStateRef.current;
    if (currentGState === 'gameover' || currentGState === 'won') return;
    setWave(w => w + 1);
    waveEnemyCountRef.current = WAVE_ENEMY_COUNT + waveRef.current * 2;
    waveSpawnTimerRef.current = 0;
    setGameState('playing');
  };

  // Main Game Loop (V2 pure coordinate resolution)
  const updateGame = () => {
    if (gameStateRef.current !== 'playing') {
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
        if (waveRef.current > 2) types.push('goliath');
        const typeKey = types[Math.floor(Math.random() * types.length)];
        const baseType = ENEMY_TYPES[typeKey];

        const laneId = `lane-${lane}-path`;
        const enemyInstance = productionEngine.mountInstance(laneId);

        enemiesRef.current.push({
          id: nextEnemyIdRef.current++,
          lane,
          type: typeKey,
          emoji: baseType.emoji,
          maxHp: baseType.hp,
          hp: baseType.hp,
          speed: baseType.speed * (1 + waveRef.current * 0.1), // slightly faster each wave
          progress: 0,
          x: 0,
          y: lane === 1 ? 150 : 350,
          rotation: 0,
          instance: enemyInstance
        });
      }
    }

    // 2. Enemy Motion Path Evaluation via V2 Motion Engine
    const currentEnemies = enemiesRef.current;
    const remainingEnemies = [];

    for (let enemy of currentEnemies) {
      if (enemy.dying) {
        if (!enemy.deathInstance) {
          if (enemy.instance) {
            enemy.instance.destroy();
            enemy.instance = null;
          }
          enemy.deathProgress = 0;
          enemy.deathInstance = productionEngine.mountInstance('enemy-death');
        }

        enemy.deathProgress += 0.05; // 20 frames to complete
        if (enemy.deathProgress >= 1.0) {
          if (enemy.deathInstance) {
            enemy.deathInstance.destroy();
          }
          enemyElsRef.current.delete(enemy.id);
          continue;
        }

        // Evaluate death animation with static target coordinates overrides
        try {
          enemy.deathInstance.seek(enemy.deathProgress);
          const track = enemy.deathInstance.tracksMap.get('death-track');
          const patch = enemy.deathInstance.compose('death-track', {
            ...track.proxy,
            x: enemy.deathX,
            y: enemy.deathY
          });
          const el = enemyElsRef.current.get(enemy.id);
          if (el && patch) {
            domRenderer(el, patch);
          }
        } catch (err) {
          console.error('MotionInstance error for enemy death:', err);
        }

        remainingEnemies.push(enemy);
        continue;
      }

      enemy.progress += enemy.speed;

      if (enemy.progress >= 1.0) {
        // Leaked - lose a life
        if (enemy.instance) {
          enemy.instance.destroy();
        }
        setLives(l => {
          const nextLives = l - 1;
          if (nextLives <= 0) setGameState('gameover');
          return nextLives;
        });
        continue;
      }

      // Query coordinates from the productionEngine using V2 resolveMotion
      try {
        if (enemy.instance) {
          enemy.instance.seek(enemy.progress);
          const trackId = `lane-${enemy.lane}-track`;
          const patch = enemy.instance.compose(trackId);
          
          if (patch) {
            enemy.x = patch.x;
            enemy.y = patch.y;
            enemy.rotation = patch.rotation || 0;

            // Render directly to DOM bypassing React render path
            const el = enemyElsRef.current.get(enemy.id);
            if (el) {
              domRenderer(el, patch);
            }
          }
        }
      } catch (err) {
        console.error('MotionInstance error for enemy:', err);
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

      // Target first enemy within range (ignoring dying ones)
      const inRangeEnemy = enemiesRef.current.find(enemy => {
        if (enemy.dying) return false;
        const dx = enemy.x - tower.x;
        const dy = enemy.y - tower.y;
        return Math.sqrt(dx * dx + dy * dy) <= TOWER_RANGE;
      });

      if (inRangeEnemy) {
        // Fire projectile
        const projInstance = productionEngine.mountInstance('projectile-arc');
        projectilesRef.current.push({
          id: nextProjIdRef.current++,
          towerId: tower.id,
          targetId: inRangeEnemy.id,
          startX: tower.x,
          startY: tower.y,
          progress: 0,
          instance: projInstance
        });
        tower.cooldown = FIRE_COOLDOWN;
      }
    }

    // 4. Projectile Motion Resolution & Hit Logic
    const currentProjectiles = projectilesRef.current;
    const remainingProjectiles = [];

    for (let proj of currentProjectiles) {
      proj.progress += PROJECTILE_SPEED;

      // Find the current target position (homing behavior) - must be alive
      const target = enemiesRef.current.find(e => e.id === proj.targetId && !e.dying);

      if (!target || proj.progress >= 1.0) {
        if (proj.instance) {
          proj.instance.destroy();
          proj.instance = null;
        }
        // If target was already killed or progress finished, explode
        if (target && proj.progress >= 1.0) {
          target.hp--;
          if (target.hp <= 0) {
            setScore(s => s + 10);
            target.dying = true;
            target.deathProgress = 0;
            target.deathX = target.x;
            target.deathY = target.y;
          }
        }
        continue;
      }

      // Interpolate projectile trajectory via V2 resolveMotion with overrides
      try {
        proj.instance.seek(proj.progress);
        const track = proj.instance.tracksMap.get('proj-track');
        const points = [{ x: proj.startX, y: proj.startY }, { x: target.x, y: target.y }];
        const customCubicPath = convertToCubicPath(points);

        const patch = proj.instance.compose('proj-track', {
          ...track.proxy,
          cubicPath: customCubicPath
        });
        
        if (patch) {
          proj.x = patch.x;
          proj.y = patch.y;
          proj.scale = patch.scale ?? 1;
          proj.opacity = patch.opacity ?? 1;

          // Render directly to DOM bypassing React render path
          const el = projElsRef.current.get(proj.id);
          if (el) {
            domRenderer(el, patch);
          }
        }
      } catch (err) {
        console.error('MotionInstance error for projectile:', err);
      }

      remainingProjectiles.push(proj);
    }
    projectilesRef.current = remainingProjectiles;

    // 5. Wave Completion / Win Check
    if (waveEnemyCountRef.current === 0 && enemiesRef.current.length === 0 && projectilesRef.current.length === 0) {
      if (waveRef.current >= 5) {
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
    return () => {
      cancelAnimationFrame(gameLoopRef.current);
      // Teardown any remaining stateful instances to prevent memory leaks
      enemiesRef.current.forEach(e => {
        if (e.instance) e.instance.destroy();
        if (e.deathInstance) e.deathInstance.destroy();
      });
      projectilesRef.current.forEach(p => {
        if (p.instance) p.instance.destroy();
      });
    };
  }, []); // Run once on mount to establish a single stable game loop

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
              d={buildMotionPath(lane1Path.tracks[0].keyframes.path.points)}
              fill="none"
              stroke="rgba(0, 242, 254, 0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d={buildMotionPath(lane1Path.tracks[0].keyframes.path.points)}
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />

            {/* Bottom Lane path */}
            <path
              d={buildMotionPath(lane2Path.tracks[0].keyframes.path.points)}
              fill="none"
              stroke="rgba(255, 107, 203, 0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d={buildMotionPath(lane2Path.tracks[0].keyframes.path.points)}
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
              <TowerRing instance={pulseInstance} color={tower.color} />
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
              ref={el => {
                if (el) enemyElsRef.current.set(enemy.id, el);
                else enemyElsRef.current.delete(enemy.id);
              }}
              className="td-enemy"
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
              ref={el => {
                if (el) projElsRef.current.set(proj.id, el);
                else projElsRef.current.delete(proj.id);
              }}
              className="td-projectile"
            />
          ))}
        </main>
      </div>
    </div>
  );
}
