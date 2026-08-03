/**
 * Graph-specific motion definitions for the second Spiral demo.
 * The original Spiral remains the behavioral reference and is untouched.
 */
export function createGraphSpiralBallMotion({ ballSize, ballTravelSeconds }) {
  return {
    tracks: [
      {
        id: "ball-path",
        duration: ballTravelSeconds,
        keyframes: {
          path: {
            points: [],
            stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: "none" }],
          },
          opacity: { stops: [{ p: 0, v: 0 }, { p: 0.05, v: 1 }, { p: 0.88, v: 1 }, { p: 1, v: 0 }] },
          "--ball-size": { stops: [{ p: 0, v: `${ballSize}px` }, { p: 1, v: `${ballSize}px` }] },
        },
      },
      {
        id: "ball-entrance",
        duration: 0.35,
        observes: [{ source: "ball-path", role: "output" }],
        keyframes: {
          scale: { stops: [{ p: 0, v: 1 }, { p: 0.35, v: 1.7 }, { p: 1, v: 1 }] },
          opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
          "--ball-size": { stops: [{ p: 0, v: `${ballSize}px` }, { p: 1, v: `${ballSize}px` }] },
        },
      },
      {
        id: "ball-exit",
        duration: 0.35,
        observes: [{ source: "ball-path", role: "output" }],
        keyframes: {
          scale: { stops: [{ p: 0, v: 1 }, { p: 0.35, v: 1.7 }, { p: 1, v: 0 }] },
          opacity: { stops: [{ p: 0, v: 1 }, { p: 0.5, v: 0.9 }, { p: 1, v: 0 }] },
          "--ball-size": { stops: [{ p: 0, v: `${ballSize}px` }, { p: 1, v: `${ballSize}px` }] },
        },
      },
    ],
  };
}

export function createGraphSpiralProject({ spiralPathPoints, ballSize, ballTravelSeconds }) {
  const motion = createGraphSpiralBallMotion({ ballSize, ballTravelSeconds });
  motion.tracks.find((track) => track.id === "ball-path").keyframes.path.points = spiralPathPoints;
  return {
    schemaVersion: 4,
    projectId: "graph-spiral-page",
    perspective: 1200,
    motions: [],
    tracks: motion.tracks,
  };
}

export function graphSpiralEdgeKeys(motion) {
  return motion.tracks.flatMap((track) =>
    (track.observes ?? []).map((edge) => `${edge.source}->${track.id}:${edge.role ?? "output"}`),
  );
}
