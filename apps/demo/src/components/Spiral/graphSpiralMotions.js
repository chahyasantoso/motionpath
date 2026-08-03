/**
 * Graph-specific motion definitions for the second Spiral demo.
 *
 * The original Spiral keeps the authored schema deliberately small because its
 * overlays are runtime-only. This model makes the runtime dependency contract
 * explicit without changing the existing project's schema or behavior.
 */
export function createGraphSpiralBallMotion({ ballSize, ballTravelSeconds }) {
  return {
    tracks: [
      {
        id: "ball-path",
        duration: ballTravelSeconds,
        keyframes: {
          pathProgress: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1, ease: "none" }] },
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

export function graphSpiralEdgeKeys(motion) {
  return motion.tracks.flatMap((track) =>
    (track.observes ?? []).map((edge) => `${edge.source}->${track.id}:${edge.role ?? "output"}`),
  );
}
