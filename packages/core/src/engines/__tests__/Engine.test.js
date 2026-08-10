import { describe, expect, it } from "vitest";
import { Engine } from "../Engine.js";

const project = {
  schemaVersion: 4,
  projectId: "lookup",
  motions: [
    {
      id: "left",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "bone",
          keyframes: {
            opacity: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
      ],
    },
    {
      id: "right",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "bone",
          keyframes: {
            opacity: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
      ],
    },
  ],
  tracks: [
    {
      id: "free",
      keyframes: {
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
        },
      },
    },
  ],
};

describe("Engine ProjectRuntime membership lookup", () => {
  it("resolves qualified and free-track config through the committed project registry", async () => {
    const engine = new Engine();
    await engine.loadProject(project);
    expect(engine.getTrackConfig("left/bone").id).toBe("bone");
    expect(engine.getTrackConfig("right/bone").id).toBe("bone");
    expect(engine.getTrackConfig("~/free").id).toBe("free");
    expect(engine.getTrackConfig("bone")).toBeNull();
    engine.destroy();
  });

  it("does not expose candidate membership during a failed reload", async () => {
    const engine = new Engine();
    await engine.loadProject(project);
    await expect(
      engine.loadProject({
        schemaVersion: 4,
        projectId: "bad",
        motions: [
          {
            id: "bad",
            trigger: { type: "manual" },
            tracks: [
              {
                id: "missing",
                keyframes: {
                  unknown: {
                    stops: [
                      { p: 0, v: 0 },
                      { p: 1, v: 1 },
                    ],
                  },
                },
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow();
    expect(engine.getTrackConfig("left/bone").id).toBe("bone");
    expect(engine.getTrackConfig("bad/missing")).toBeNull();
    engine.destroy();
  });
});
