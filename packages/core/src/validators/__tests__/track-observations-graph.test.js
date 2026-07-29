import { describe, expect, it } from "vitest";
import { validateProject } from "../index.js";

const track = (id, observes) => ({
  id,
  observes,
  keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } },
});
const project = (tracks) => ({
  schemaVersion: 4,
  motions: [{ id: "motion", trigger: { type: "manual" }, tracks }],
});

describe("track observation graph validation", () => {
  it("rejects a two-track cycle", () => {
    const errors = validateProject(project([
      track("a", [{ source: "b" }]),
      track("b", [{ source: "a" }]),
    ]));
    expect(errors.some((error) => error.ruleId === "track-observations-cycle")).toBe(true);
  });

  it("rejects duplicate and invalid observation edges", () => {
    const errors = validateProject(project([
      track("a", [{ source: "missing" }, { source: "missing" }]),
      track("b", [{ source: "b", role: "bad" }]),
    ]));
    expect(errors.filter((error) => error.ruleId === "track-observations").length).toBeGreaterThanOrEqual(4);
  });

  it("accepts a diamond graph", () => {
    const errors = validateProject(project([
      track("root"),
      track("left", [{ source: "root" }]),
      track("right", [{ source: "root" }]),
      track("join", [{ source: "left" }, { source: "right" }]),
    ]));
    expect(errors.filter((error) => error.severity === "error")).toEqual([]);
  });
});
