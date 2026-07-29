import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../Engine.js";

const project = {
  schemaVersion: 4,
  projectId: "fk-observation-test",
  motions: [
    {
      id: "arm",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "parent",
          keyframes: {
            x: { stops: [{ p: 0, v: 10 }, { p: 1, v: 30 }] },
            y: { stops: [{ p: 0, v: 5 }, { p: 1, v: 15 }] },
            rotation: { stops: [{ p: 0, v: 0 }, { p: 1, v: 90 }] },
          },
        },
        {
          id: "child",
          observes: [{ source: "parent", role: "input", target: "parentWorld" }],
          keyframes: {
            boneLength: { stops: [{ p: 0, v: 10 }, { p: 1, v: 20 }] },
          },
        },
      ],
    },
  ],
};

describe("declarative track observations", () => {
  let engine;
  afterEach(() => engine?.destroy());

  it("wires an input observation before composition", async () => {
    engine = new Engine();
    await engine.loadProject(project);
    const motion = engine.mountInstance("arm");
    const parent = motion.getTrack("parent");
    const child = motion.getTrack("child");

    parent.progress(0.5);
    child.progress(0.5);
    expect(child.compose()).toMatchObject({
      x: 30.6066017178,
      y: 20.6066017178,
      rotation: 45,
    });
  });
});
