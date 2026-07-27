import { useCallback, useEffect, useRef, useState } from 'react';
import { engine } from '../../engines/Engine.js';
import { domRenderer } from '../../renderers/domRenderer.js';
import { gsapTickerClock } from '../../lib/gsapTickerClock.js';
import { LANE_1_POINTS, LANE_2_POINTS } from './towerDefenseMotions.js';

const STAGE_WIDTH = 900;
const STAGE_HEIGHT = 500;
const TOWER_RANGE = 180;
const FIRE_COOLDOWN = 60;
const WAVE_ENEMY_COUNT = 6;
const PROJECTILE_SPEED = 0.04;
const TOWERS_CONFIG = [{ id: 'tower-1', x: 220, y: 250, name: 'Arc Cannon', color: '#00f2fe', cooldown: 0 }, { id: 'tower-2', x: 450, y: 220, name: 'Plasma Spire', color: '#ff6bcb', cooldown: 0 }, { id: 'tower-3', x: 680, y: 270, name: 'Quantum Ray', color: '#f5a623', cooldown: 0 }];
const ENEMY_TYPES = { crawler: { hp: 3, speed: 0.002, emoji: '👾' }, scout: { hp: 2, speed: 0.0035, emoji: '🛸' }, goliath: { hp: 10, speed: 0.001, emoji: '🤖' } };

function pointAt(points, progress) {
  const i = Math.min(points.length - 2, Math.floor(progress * (points.length - 1)));
  const t = progress * (points.length - 1) - i;
  const a = points[i]; const b = points[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, rotation: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
}

export function useTowerDefenseController(isLoaded, enemyElsRef, projElsRef) {
  const [gameState, setGameState] = useState('idle');
  const [wave, setWave] = useState(0);
  const [lives, setLives] = useState(20);
  const [score, setScore] = useState(0);
  const [uiEnemies, setUiEnemies] = useState([]);
  const [uiProjectiles, setUiProjectiles] = useState([]);
  const stateRef = useRef('idle'); const waveRef = useRef(0); const enemies = useRef([]); const projectiles = useRef([]); const towers = useRef(TOWERS_CONFIG.map((t) => ({ ...t })));
  const nextEnemy = useRef(1); const nextProjectile = useRef(1); const remainingToSpawn = useRef(0); const spawnElapsed = useRef(0);
  const motionRefs = useRef(new Map());
  useEffect(() => { stateRef.current = gameState; }, [gameState]);
  useEffect(() => { waveRef.current = wave; }, [wave]);

  const destroyMotion = (instance) => { if (instance) engine.unmount(instance); };
  const mountManual = (id) => engine.mountInstance(id);
  const renderTrack = (instance, trackId, progress, element, extra = {}) => {
    if (!instance) return {};
    instance.seek(progress);
    const track = instance.getTrack(trackId);
    if (!track) return {};
    const patch = track.compose({ ...track.getSnapshot(), ...extra });
    if (element) domRenderer(element, patch);
    return patch;
  };

  const reset = useCallback(() => {
    enemies.current.forEach((e) => { destroyMotion(e.instance); destroyMotion(e.deathInstance); });
    projectiles.current.forEach((p) => destroyMotion(p.instance));
    enemies.current = []; projectiles.current = []; towers.current = TOWERS_CONFIG.map((t) => ({ ...t }));
    nextEnemy.current = 1; nextProjectile.current = 1; remainingToSpawn.current = 0; spawnElapsed.current = 0;
    setLives(20); setScore(0); setWave(0); setUiEnemies([]); setUiProjectiles([]); setGameState('idle');
  }, []);

  const startWave = useCallback(() => {
    if (stateRef.current === 'gameover' || stateRef.current === 'won') return;
    setWave((value) => value + 1); remainingToSpawn.current = WAVE_ENEMY_COUNT + waveRef.current * 2; spawnElapsed.current = 0; setGameState('playing');
  }, []);

  useEffect(() => {
    if (!isLoaded) return undefined;
    const unsubscribe = gsapTickerClock.subscribe((deltaMs) => {
      if (stateRef.current !== 'playing') return;
      const deltaFrames = Math.max(0.5, deltaMs / (1000 / 60));
      spawnElapsed.current += deltaFrames;
      if (remainingToSpawn.current > 0 && spawnElapsed.current >= 80) {
        spawnElapsed.current = 0; remainingToSpawn.current -= 1;
        const lane = Math.random() > 0.5 ? 1 : 2; const types = waveRef.current > 2 ? ['crawler', 'scout', 'goliath'] : ['crawler', 'scout']; const type = ENEMY_TYPES[types[Math.floor(Math.random() * types.length)]];
        const instance = mountManual(`lane-${lane}-path`); const id = nextEnemy.current++;
        enemies.current.push({ id, lane, type, emoji: type.emoji, maxHp: type.hp, hp: type.hp, speed: type.speed * (1 + waveRef.current * 0.1), progress: 0, instance, x: lane === 1 ? 0 : 0, y: lane === 1 ? 150 : 350, rotation: 0 });
      }
      const nextEnemies = [];
      for (const enemy of enemies.current) {
        if (enemy.dying) {
          enemy.deathProgress += 0.05; const el = enemyElsRef.current.get(enemy.id); renderTrack(enemy.deathInstance, 'death-track', enemy.deathProgress, el, { x: enemy.deathX, y: enemy.deathY });
          if (enemy.deathProgress >= 1) { destroyMotion(enemy.deathInstance); enemyElsRef.current.delete(enemy.id); continue; }
          nextEnemies.push(enemy); continue;
        }
        enemy.progress += enemy.speed * deltaFrames;
        if (enemy.progress >= 1) { destroyMotion(enemy.instance); setLives((value) => { const next = value - 1; if (next <= 0) setGameState('gameover'); return next; }); continue; }
        const el = enemyElsRef.current.get(enemy.id); const points = enemy.lane === 1 ? LANE_1_POINTS : LANE_2_POINTS; const point = pointAt(points, enemy.progress); enemy.x = point.x; enemy.y = point.y; enemy.rotation = point.rotation; if (el) domRenderer(el, { x: point.x, y: point.y, rotation: point.rotation });
        nextEnemies.push(enemy);
      }
      enemies.current = nextEnemies;
      for (const tower of towers.current) {
        if (tower.cooldown > 0) { tower.cooldown -= deltaFrames; continue; }
        const target = enemies.current.find((enemy) => !enemy.dying && Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= TOWER_RANGE);
        if (target) { projectiles.current.push({ id: nextProjectile.current++, targetId: target.id, startX: tower.x, startY: tower.y, progress: 0, instance: mountManual('projectile-style') }); tower.cooldown = FIRE_COOLDOWN; }
      }
      const nextProjectiles = [];
      for (const projectile of projectiles.current) {
        projectile.progress += PROJECTILE_SPEED * deltaFrames; const target = enemies.current.find((enemy) => enemy.id === projectile.targetId && !enemy.dying);
        if (!target || projectile.progress >= 1) { destroyMotion(projectile.instance); if (target && projectile.progress >= 1) { target.hp -= 1; if (target.hp <= 0) { target.dying = true; target.deathProgress = 0; target.deathX = target.x; target.deathY = target.y; setScore((value) => value + 10); target.deathInstance = mountManual('enemy-death'); } } continue; }
        const x = projectile.startX + (target.x - projectile.startX) * projectile.progress; const y = projectile.startY + (target.y - projectile.startY) * projectile.progress; const el = projElsRef.current.get(projectile.id); renderTrack(projectile.instance, 'projectile-track', projectile.progress, el, { x, y }); nextProjectiles.push(projectile);
      }
      projectiles.current = nextProjectiles;
      setUiEnemies([...enemies.current]); setUiProjectiles([...projectiles.current]);
      if (remainingToSpawn.current === 0 && enemies.current.length === 0 && projectiles.current.length === 0) setGameState(waveRef.current >= 5 ? 'won' : 'idle');
    });
    return () => { unsubscribe(); reset(); };
  }, [isLoaded, reset, enemyElsRef, projElsRef]);

  return { gameState, wave, lives, score, uiEnemies, uiProjectiles, towers: towers.current, startWave, reset };
}
