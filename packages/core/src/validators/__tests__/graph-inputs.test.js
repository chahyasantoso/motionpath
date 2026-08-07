import { describe, expect, it } from "vitest";
import { validateProject } from "../index.js";

const base = (tracks) => ({ schemaVersion: 4, projectId: "graph-inputs", motions: [{ id: "rig", trigger: { type: "manual" }, tracks }] });
const fk = (extra = {}) => ({ id: "bone", mode: "authored-graph", keyframes: { boneLength: { stops: [{ p: 0, v: 10 }, { p: 1, v: 10 }] } }, ...extra });

describe("explicit authored graph plugin inputs", () => {
  it("requires parentWorld in authored-graph mode", () => { const errors = validateProject(base([fk()])); expect(errors.some((e) => e.ruleId === "GRAPH_INPUT_MISSING")).toBe(true); });
  it("accepts exactly one compatible input edge", () => {
    const errors = validateProject(base([{ id: "parent", keyframes: { x: { stops: [{ p: 0, v: 0 }, { p: 1, v: 0 }] } } }, fk({ observes: [{ source: "parent", role: "input", target: "parentWorld" }] })]));
    expect(errors.filter((e) => e.ruleId.startsWith("GRAPH_INPUT_"))).toEqual([]);
  });
  it("rejects duplicate and mismatched input edges", () => {
    const errors = validateProject(base([{ id: "parent", keyframes: {} }, fk({ observes: [{ source: "parent", role: "input", target: "parentWorld" }, { source: "parent", role: "input", target: "parentWorld" }, { source: "parent", role: "input", target: "wrong" }] })]));
    expect(errors.some((e) => e.ruleId === "GRAPH_INPUT_DUPLICATE")).toBe(true);
    expect(errors.some((e) => e.ruleId === "GRAPH_INPUT_ROLE_MISMATCH")).toBe(true);
  });
  it("allows the documented standalone fallback", () => { const errors = validateProject(base([fk({ mode: "standalone" })])); expect(errors.filter((e) => e.ruleId.startsWith("GRAPH_INPUT_"))).toEqual([]); });
});
