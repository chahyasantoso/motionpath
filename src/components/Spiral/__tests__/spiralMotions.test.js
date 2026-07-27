import { describe, it, expect } from "vitest";
import { createSpiralProject } from "../spiralMotions.js";

describe("Spiral v4 project schema", () => {
  it("keeps the dynamic host as a motion and transition overlays as standalone tracks", () => {
    const project = createSpiralProject({
      spiralPathPoints: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      ballTravelSeconds: 4,
      ballSize: 20,
      spawnIntervalMs: 500,
    });

    expect(project.schemaVersion).toBe(4);
    expect(project.motions.map((motion) => motion.id)).toEqual([
      "spiral-container",
      "spiral-zuma",
    ]);
    expect(project.tracks.map((track) => track.id)).toEqual([
      "ball-exit-track",
      "ball-entrance-track",
    ]);
    expect(
      project.motions.flatMap((motion) => motion.tracks).every((track) =>
        track.duration || track.id === "keepalive",
      ),
    ).toBe(true);
  });
});
