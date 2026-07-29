// ─── Path Data ────────────────────────────────────────────────────
// S-curve road: viewport-relative coords (0..1280 x 0..600)
export const roadNodes = [
  { x: -80, y: 500 },
  { x: 280, y: 360, ctrlX: 60, ctrlY: 560 },
  { x: 640, y: 240, ctrlX: 480, ctrlY: 180 },
  { x: 960, y: 140, ctrlX: 800, ctrlY: 310 },
  { x: 1380, y: 70, ctrlX: 1120, ctrlY: 30 },
];

// Shadow is offset 22px below the main path
export const shadowNodes = roadNodes.map((n) => ({
  ...n,
  y: n.y + 22,
  ...(n.ctrlY !== undefined ? { ctrlY: n.ctrlY + 22 } : {}),
}));

// Cloud paths (independent, slower visual layers)
export const cloudANodes = [
  { x: -240, y: 90 },
  { x: 1400, y: 80 },
];

export const cloudBNodes = [
  { x: -240, y: 140 },
  { x: 1400, y: 120 },
];

// Speed streak paths (horizontal, bottom half)
export const streakANodes = [
  { x: -400, y: 510 },
  { x: 1400, y: 510 },
];

export const streakBNodes = [
  { x: -400, y: 470 },
  { x: 1400, y: 470 },
];

// ─── Project Schema ───────────────────────────────────────────────
export const RIDE_DURATION = 5; // seconds end-to-end
const CLOUD_DURATION = RIDE_DURATION * 1.8;
const STREAK_DURATION = RIDE_DURATION * 0.9;

// v4: the trigger owns repeat/yoyo, the TRACK owns duration. In v2 these
// scenes put `duration` inside the trigger, where TimeTriggerDelegate never
// looked at it -- every ride silently fell back to createTrack's 1s default.
const LOOP = { type: "time", repeat: -1, yoyo: false };

export const motorcycleProject = {
  schemaVersion: 4,
  projectId: "motorcycle-page",
  motions: [
    // Main bike along the S-curve
    {
      id: "moto-bike-scene",
      trigger: LOOP,
      tracks: [
        {
          id: "moto-bike",
          duration: RIDE_DURATION,
          keyframes: {
            path: {
              points: roadNodes,
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
              autoRotate: true,
            },
            opacity: {
              stops: [
                { p: 0.0, v: 0 },
                { p: 0.04, v: 1 },
                { p: 0.92, v: 1 },
                { p: 1.0, v: 0 },
              ],
            },
          },
        },
      ],
    },
    // Shadow — same path, offset
    {
      id: "moto-shadow-scene",
      trigger: LOOP,
      tracks: [
        {
          id: "moto-shadow",
          duration: RIDE_DURATION,
          keyframes: {
            path: {
              points: shadowNodes,
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
              autoRotate: true,
            },
            opacity: {
              stops: [
                { p: 0.0, v: 0 },
                { p: 0.05, v: 0.35 },
                { p: 0.92, v: 0.35 },
                { p: 1.0, v: 0 },
              ],
            },
          },
        },
      ],
    },
    // Clouds
    {
      id: "moto-clouds-scene",
      trigger: LOOP,
      tracks: [
        {
          id: "moto-cloud-a",
          duration: CLOUD_DURATION,
          keyframes: {
            path: {
              points: cloudANodes,
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
        {
          id: "moto-cloud-b",
          duration: CLOUD_DURATION,
          keyframes: {
            path: {
              points: cloudBNodes,
              stops: [
                { p: 0, v: 0.22 },
                { p: 1, v: 1 },
              ],
            },
            opacity: {
              stops: [
                { p: 0.0, v: 0 },
                { p: 0.24, v: 0.55 },
                { p: 0.85, v: 0.55 },
                { p: 1.0, v: 0 },
              ],
            },
          },
        },
      ],
    },
    // Speed streaks
    {
      id: "moto-streaks-scene",
      trigger: LOOP,
      tracks: [
        {
          id: "moto-streak-a",
          duration: STREAK_DURATION,
          keyframes: {
            path: {
              points: streakANodes,
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
            opacity: {
              stops: [
                { p: 0.0, v: 0 },
                { p: 0.05, v: 0.55 },
                { p: 0.88, v: 0.55 },
                { p: 1.0, v: 0 },
              ],
            },
          },
        },
        {
          id: "moto-streak-b",
          duration: STREAK_DURATION,
          keyframes: {
            path: {
              points: streakBNodes,
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
            opacity: {
              stops: [
                { p: 0.0, v: 0 },
                { p: 0.08, v: 0.35 },
                { p: 0.88, v: 0.35 },
                { p: 1.0, v: 0 },
              ],
            },
          },
        },
      ],
    },
  ],
};
