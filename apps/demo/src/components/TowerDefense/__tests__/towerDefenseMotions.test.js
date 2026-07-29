import { describe, it, expect } from "vitest";
import { validateProject } from "@motionpath/core";
import { towerDefenseProject } from "../towerDefenseMotions.js";

describe("tower defense motions", () => {
  it("validates its project schema", () => {
    const errors = validateProject(towerDefenseProject);
    expect(errors.filter((error) => error.severity === "error")).toEqual([]);
  });
});
