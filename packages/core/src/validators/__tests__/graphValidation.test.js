import { describe, expect, it } from "vitest";
import { validateObservationGraph, validateProject } from "../index.js";

const opacity = { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] };

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
          { id: "a", keyframes: { opacity }, observes: [{ source: "b" }] },
          { id: "b", keyframes: { opacity }, observes: [{ source: "a" }] },
        ],
      }],
    });
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "track-observations-cycle", severity: "error", path: "motions[0].tracks" }),
    ]));
  });
});
