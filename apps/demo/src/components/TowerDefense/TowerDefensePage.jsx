import { useEffect, useRef } from "react";
import { buildMotionPath } from "../../utils/pathUtils.js";
import useMotionProject from "@motionpath/react/useMotionProject.js";
import useMotionInstance from "@motionpath/react/useMotionInstance.js";
import { domRenderer } from "../../renderers/domRenderer.js";
import { useTowerDefenseController } from "./useTowerDefenseController.js";
import {
  towerDefenseProject,
  LANE_1_POINTS,
  LANE_2_POINTS,
} from "./towerDefenseMotions.js";
import "./TowerDefensePage.css";

const STAGE_WIDTH = 900;
const STAGE_HEIGHT = 500;
function TowerRing({ instance, color }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!instance) return undefined;
    const track = instance.getTrack("tower-pulse-ring");
    if (!track) return undefined;
    return track.subscribe((raw) =>
      domRenderer(ref.current, track.compose(raw)),
    );
  }, [instance]);
  return (
    <div
      ref={ref}
      className="tower-pulse-ring"
      style={{ borderColor: color, boxShadow: `0 0 12px ${color}` }}
    />
  );
}
export default function TowerDefensePage() {
  const isLoaded = useMotionProject(towerDefenseProject);
  const pulseInstance = useMotionInstance(
    isLoaded ? "tower-pulse-motion" : null,
  );
  const enemyElsRef = useRef(new Map());
  const projElsRef = useRef(new Map());
  const game = useTowerDefenseController(isLoaded, enemyElsRef, projElsRef);
  return (
    <div className="td-page">
      <div className="td-container">
        <header className="td-hud">
          <div className="hud-metric">
            <span className="hud-label">Score</span>
            <span className="hud-val">{game.score}</span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">Wave</span>
            <span className="hud-val">{game.wave} / 5</span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">Lives</span>
            <span className="hud-val lives-val">{game.lives}</span>
          </div>
        </header>
        <main className="td-playfield">
          {game.gameState === "idle" && (
            <div className="td-overlay">
              <h2>Wave {game.wave + 1} Ready</h2>
              <p>
                Pre-placed energy towers are online. Click Start to begin the
                assault.
              </p>
              <button className="td-btn" onClick={game.startWave}>
                Start Wave
              </button>
            </div>
          )}
          {game.gameState === "gameover" && (
            <div className="td-overlay lose-overlay">
              <h2 className="text-red">System Offline</h2>
              <p>
                The defense shield failed. Score achieved:{" "}
                <strong>{game.score}</strong>
              </p>
              <button className="td-btn btn-red" onClick={game.reset}>
                Restart Game
              </button>
            </div>
          )}
          {game.gameState === "won" && (
            <div className="td-overlay win-overlay">
              <h2 className="text-green">Victory</h2>
              <p>All waves clear. Cosmic corridor secured!</p>
              <button className="td-btn btn-green" onClick={game.reset}>
                Play Again
              </button>
            </div>
          )}
          <svg
            className="td-path-svg"
            width={STAGE_WIDTH}
            height={STAGE_HEIGHT}
          >
            <path
              d={buildMotionPath(LANE_1_POINTS)}
              fill="none"
              stroke="rgba(0, 242, 254, 0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d={buildMotionPath(LANE_1_POINTS)}
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
            <path
              d={buildMotionPath(LANE_2_POINTS)}
              fill="none"
              stroke="rgba(255, 107, 203, 0.08)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d={buildMotionPath(LANE_2_POINTS)}
              fill="none"
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth="2"
              strokeDasharray="8 6"
            />
          </svg>
          {game.towers.map((tower) => (
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
                  borderColor: tower.color,
                }}
              >
                🗼
              </div>
              <div className="tower-meta">
                <span className="tower-name">{tower.name}</span>
                <div
                  className="tower-range-indicator"
                  style={{ width: 360, height: 360 }}
                />
              </div>
            </div>
          ))}
          {game.uiEnemies.map((enemy) => (
            <div
              key={enemy.id}
              ref={(el) =>
                el
                  ? enemyElsRef.current.set(enemy.id, el)
                  : enemyElsRef.current.delete(enemy.id)
              }
              className="td-enemy"
            >
              <div className="enemy-emoji">{enemy.emoji}</div>
              <div className="enemy-hp-bar">
                <div
                  className="enemy-hp-fill"
                  style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {game.uiProjectiles.map((projectile) => (
            <div
              key={projectile.id}
              ref={(el) =>
                el
                  ? projElsRef.current.set(projectile.id, el)
                  : projElsRef.current.delete(projectile.id)
              }
              className="td-projectile"
            />
          ))}
        </main>
      </div>
    </div>
  );
}
