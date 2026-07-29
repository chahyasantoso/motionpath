export function createSpiralBallScene({
  spiralPathPoints,
  ballTravelSeconds,
  ballSize,
}) {
  return {
    id: "spiral-zuma",
    trigger: { type: "time" },
    tracks: [
      {
        id: "ball-track",
        duration: ballTravelSeconds,
        keyframes: {
          path: {
            points: spiralPathPoints,
            stops: [
              { p: 0, v: 0 },
              { p: 1, v: 1, ease: "none" },
            ],
          },
          opacity: {
            stops: [
              { p: 0, v: 0 },
              { p: 0.05, v: 1 },
              { p: 0.88, v: 1 },
              { p: 1, v: 0 },
            ],
          },
          "--ball-size": {
            stops: [
              { p: 0, v: `${ballSize}px` },
              { p: 1, v: `${ballSize}px` },
            ],
          },
        },
      },
    ],
  };
}

export function createSpiralTransitionTracks({ ballSize }) {
  return [
    {
      id: "ball-exit-track",
      duration: 0.35,
      keyframes: {
        scale: {
          stops: [
            { p: 0, v: 1 },
            { p: 0.35, v: 1.7 },
            { p: 1, v: 0 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 1 },
            { p: 0.5, v: 0.9 },
            { p: 1, v: 0 },
          ],
        },
        "--ball-size": {
          stops: [
            { p: 0, v: `${ballSize}px` },
            { p: 1, v: `${ballSize}px` },
          ],
        },
      },
    },
    {
      id: "ball-entrance-track",
      duration: 0.35,
      keyframes: {
        scale: {
          stops: [
            { p: 0, v: 1 },
            { p: 0.35, v: 1.7 },
            { p: 1, v: 1 },
          ],
        },
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
        },
        "--ball-size": {
          stops: [
            { p: 0, v: `${ballSize}px` },
            { p: 1, v: `${ballSize}px` },
          ],
        },
      },
    },
  ];
}

export function createSpiralProject({
  spiralPathPoints,
  ballTravelSeconds,
  ballSize,
}) {
  return {
    schemaVersion: 4,
    projectId: "spiral-zuma-page",
    perspective: 1200,
    motions: [createSpiralBallScene({ spiralPathPoints, ballTravelSeconds, ballSize })],
    tracks: createSpiralTransitionTracks({ ballSize }),
  };
}
