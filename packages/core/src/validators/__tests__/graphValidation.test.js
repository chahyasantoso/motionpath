import { describe, expect, it } from "vitest";
import { validateObservationGraph, validateProject } from "../index.js";

describe("rig graph validation", () => {
  it("converts graph IR errors into fatal diagnostics", () => {
    const errors = validateObservationGraph({
      tracks: [
        { id: "a", observes: [{ source: "b" }] },
        { id: "b", observes: [{ source: "a" }] },
      ],
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "track-observations-cycle", severity: "error" }),
    ]));
  });

  it("rejects a cyclic motion during normal project validation", () => {
    const errors = validateProject({
      schemaVersion: 4,
      projectId: "cycle-fixture",
      motions: [{
        id: "cycle",
        trigger: { type: "manual" },
        tracks: [
          { id: "a", keyframes: {}, observes: [{ source: "b" }] },
          { id: "b", keyframes: {}, observes: [{ source: "a" }] },
        ],
      }],
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "track-observations-cycle", severity: "error", path: "motions[0].tracks" }),
    ]));
  });
});
