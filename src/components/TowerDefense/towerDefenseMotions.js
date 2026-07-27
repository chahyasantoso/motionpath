export const LANE_1_POINTS = [
  { x: 0, y: 150 },
  { x: 220, y: 80, ctrlX: 110, ctrlY: 30 },
  { x: 450, y: 380, ctrlX: 320, ctrlY: 420 },
  { x: 680, y: 120, ctrlX: 580, ctrlY: 100 },
  { x: 900, y: 200, ctrlX: 800, ctrlY: 280 },
];
export const LANE_2_POINTS = [
  { x: 0, y: 350 },
  { x: 220, y: 420, ctrlX: 110, ctrlY: 470 },
  { x: 450, y: 120, ctrlX: 320, ctrlY: 80 },
  { x: 680, y: 380, ctrlX: 580, ctrlY: 400 },
  { x: 900, y: 300, ctrlX: 800, ctrlY: 220 },
];

const pathMotion = (id, trackId, points) => ({
  id,
  trigger: { type: 'manual' },
  tracks: [{ id: trackId, keyframes: { path: { points, stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: 'none' }], autoRotate: true } } }],
});

export const towerDefenseProject = {
  schemaVersion: 4,
  projectId: 'tower-defense-game',
  perspective: 1200,
  motions: [
    pathMotion('lane-1-path', 'lane-1-track', LANE_1_POINTS),
    pathMotion('lane-2-path', 'lane-2-track', LANE_2_POINTS),
    { id: 'tower-pulse-motion', trigger: { type: 'time', repeat: -1 }, tracks: [{ id: 'tower-pulse-ring', duration: 1.6, keyframes: { scale: { stops: [{ p: 0, v: 0.5 }, { p: 0.8, v: 1.8 }, { p: 1, v: 0.5 }] }, opacity: { stops: [{ p: 0, v: 0.6 }, { p: 0.8, v: 0 }, { p: 1, v: 0.6 }] } } }] },
    { id: 'projectile-style', trigger: { type: 'manual' }, tracks: [{ id: 'projectile-track', duration: 1, keyframes: { scale: { stops: [{ p: 0, v: 0.5 }, { p: 0.2, v: 1.3 }, { p: 1, v: 0.7 }] }, opacity: { stops: [{ p: 0, v: 1 }, { p: 0.8, v: 1 }, { p: 1, v: 0 }] } } }] },
    { id: 'enemy-death', trigger: { type: 'manual' }, tracks: [{ id: 'death-track', duration: 1, keyframes: { rotation: { stops: [{ p: 0, v: 0 }, { p: 1, v: 270 }] }, scale: { stops: [{ p: 0, v: 1 }, { p: 0.3, v: 1.4 }, { p: 1, v: 0 }] }, opacity: { stops: [{ p: 0, v: 1 }, { p: 1, v: 0 }] } } }] },
  ],
};
