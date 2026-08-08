import { describe, expect, it } from "vitest";
import { validateProject } from "../index.js";

const base = (tracks) => ({ schemaVersion: 4, projectId: "graph-inputs", motions: [{ id: "rig", trigger: { type: "manual" }, tracks }] });
const fk = (extra = {}) => ({ id: "bone", keyframes: { boneLength: { stops: [{ p: 0, v: 10 }, { p: 1, v: 10 }] } }, ...extra });

describe("explicit authored graph plugin inputs", () => {
  it("treats a project motion track without mode as authored-graph", () => {
    const errors = validateProject(base([fk()]));
    expect(errors.some((e) => e.ruleId === "GRAPH_INPUT_MISSING")).toBe(true);
  });
  it("requires parentWorld in authored-graph mode", () => {
    const errors = validateProject(base([fk({ mode: "authored-graph" })]));
    expect(errors.some((e) => e.ruleId === "GRAPH_INPUT_MISSING")).toBe(true);
  });
  it("accepts exactly one compatible input edge", () => {
    const errors = validateProject(base([{ id: "parent", keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 0 }] } } }, fk({ observes: [{ source: "parent", role: "input", target: "parentWorld" }] })]));
    expect(errors.filter((e) => e.ruleId.startsWith("GRAPH_INPUT_")).filter((e) => e.severity === "error")).toEqual([]);
  });
  it("rejects duplicate and unknown input edges", () => {
    const errors = validateProject(base([{ id: "parent", keyframes: {} }, fk({ observes: [{ source: "parent", role: "input", target: "parentWorld" }, { source: "parent", role: "input", target: "parentWorld" }, { source: "parent", role: "input", target: "wrong" }] })]));
    expect(errors.some((e) => e.ruleId === "GRAPH_INPUT_DUPLICATE")).toBe(true);
    expect(errors.some((e) => e.ruleId === "GRAPH_INPUT_UNKNOWN")).toBe(true);
  });
  it("allows the documented standalone fallback only when explicit", () => {
    const errors = validateProject(base([fk({ mode: "standalone" })]));
    expect(errors.filter((e) => e.ruleId.startsWith("GRAPH_INPUT_"))).toEqual([]);
  });
});
