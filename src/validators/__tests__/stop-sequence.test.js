import { describe, it, expect } from "vitest";
import { validateProject } from "../index.js";

function project(stops) {
  return {
    schemaVersion: 4,
    motions: [
      {
        id: "motion",
        trigger: { type: "manual" },
        tracks: [{ id: "track", keyframes: { opacity: { stops } } }],
      },
    ],
  };
}

describe("stop-sequence validation", () => {
  it("rejects duplicate positions", () => {
    const errors = validateProject(
      project([
        { p: 0, v: 0 },
        { p: 0.5, v: 1 },
        { p: 0.5, v: 0.8 },
        { p: 1, v: 1 },
      ]),
    );
    expect(errors.filter((error) => error.ruleId === "stop-sequence")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("Duplicate stop position 0.5"),
        }),
      ]),
    );
  });

  it("rejects non-monotonic positions", () => {
    const errors = validateProject(
      project([
        { p: 0, v: 0 },
        { p: 0.8, v: 1 },
        { p: 0.4, v: 0.5 },
        { p: 1, v: 1 },
      ]),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "stop-sequence",
          severity: "error",
          message: expect.stringContaining("must be monotonic"),
        }),
      ]),
    );
  });

  it("warns when endpoint seeds are missing", () => {
    const errors = validateProject(
      project([
        { p: 0.25, v: 0 },
        { p: 0.75, v: 1 },
      ]),
    );
    const sequenceErrors = errors.filter(
      (error) => error.ruleId === "stop-sequence",
    );
    expect(sequenceErrors).toHaveLength(2);
    expect(sequenceErrors.every((error) => error.severity === "warning")).toBe(
      true,
    );
  });
});
