import { describe, expect, it } from "vitest";
import { normalizeObservationGraph } from "@motionpath/core/usecases/normalizeObservationGraph.js";
import { createGraphSpiralBallMotion, graphSpiralEdgeKeys } from "../graphSpiralMotions.js";

describe("graph Spiral motion model", () => {
  it("keeps path and transition ownership explicit", () => {
    const motion = createGraphSpiralBallMotion({ ballSize: 32, ballTravelSeconds: 8 });
    const graph = normalizeObservationGraph(motion);

    expect(graph.valid).toBe(true);
    expect(graph.order).toEqual(["ball-path", "ball-entrance", "ball-exit"]);
    expect(graphSpiralEdgeKeys(motion)).toEqual([
      "ball-path->ball-entrance:output",
      "ball-path->ball-exit:output",
    ]);
  });

  it("keeps transition tracks renderer-neutral and independently addressable", () => {
    const motion = createGraphSpiralBallMotion({ ballSize: 24, ballTravelSeconds: 5 });
    const path = motion.tracks.find((track) => track.id === "ball-path");
    const entrance = motion.tracks.find((track) => track.id === "ball-entrance");
    const exit = motion.tracks.find((track) => track.id === "ball-exit");

    expect(path.keyframes.pathProgress).toBeTruthy();
    expect(entrance.keyframes.scale).toBeTruthy();
    expect(exit.keyframes.scale).toBeTruthy();
    expect(entrance.observes).toEqual([{ source: "ball-path", role: "output" }]);
    expect(exit.observes).toEqual([{ source: "ball-path", role: "output" }]);
  });
});
