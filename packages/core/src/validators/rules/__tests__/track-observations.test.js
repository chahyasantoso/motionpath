import { describe, expect, it } from "vitest";
import { validateProject } from "../../index.js";

const base = {
  schemaVersion: 4,
  motions: [
    {
      id: "m",
      trigger: { type: "manual" },
      tracks: [
        {
          id: "parent",
          keyframes: {
            opacity: {
              stops: [
                { p: 0, v: 0 },
                { p: 1, v: 1 },
              ],
            },
          },
        },
        {
          id: "child",
          keyframes: {
            boneLength: {
              stops: [
                { p: 0, v: 1 },
                { p: 1, v: 2 },
              ],
            },
          },
        },
      ],
    },
  ],
};

describe("track observations validation", () => {
  it("requires input targets and known same-motion sources", () => {
    const errors = validateProject({
      ...base,
      motions: [
        {
          ...base.motions[0],
          tracks: [
            base.motions[0].tracks[0],
            {
              ...base.motions[0].tracks[1],
              observes: [
                { source: "missing", role: "input" },
                { source: "parent", role: "output", target: "bad" },
              ],
            },
          ],
        },
      ],
    }).filter((error) => error.ruleId === "track-observations");
    expect(errors).toHaveLength(3);
  });
});
