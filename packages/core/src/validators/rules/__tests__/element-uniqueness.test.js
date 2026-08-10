import { describe, it, expect } from "vitest";
import { elementUniquenessRule } from "../element-uniqueness.js";

describe("element-uniqueness rule", () => {
  it("should pass when track IDs are unique within each motion", () => {
    const motions = [
      { tracks: [{ id: "el-1" }, { id: "el-2" }] },
      { tracks: [{ id: "el-3" }] },
    ];
    expect(elementUniquenessRule(motions)).toHaveLength(0);
  });

  it("should error when a track ID is duplicated within the same motion", () => {
    const motions = [{ tracks: [{ id: "el-1" }, { id: "el-1" }] }];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe("element-uniqueness");
    expect(errors[0].severity).toBe("error");
    expect(errors[0].path).toBe("motions[0].tracks[1].id");
    expect(errors[0].message).toContain("Duplicate track ID 'el-1'");
  });

  it("should allow the same track ID across different motions (PR-17: bare IDs are motion-local)", () => {
    const motions = [
      { tracks: [{ id: "el-1" }] },
      { tracks: [{ id: "el-1" }] },
    ];
    expect(elementUniquenessRule(motions)).toHaveLength(0);
  });

  it("should stay quiet when the same ID repeats across 3+ motions", () => {
    const motions = [
      { tracks: [{ id: "el-1" }] },
      { tracks: [{ id: "el-1" }] },
      { tracks: [{ id: "el-1" }] },
    ];
    expect(elementUniquenessRule(motions)).toHaveLength(0);
  });

  it("should still report every duplicate inside one motion independently", () => {
    const motions = [
      { tracks: [{ id: "el-1" }, { id: "el-1" }, { id: "el-1" }] },
    ];
    const errors = elementUniquenessRule(motions);
    expect(errors).toHaveLength(2);
    expect(errors[0].path).toBe("motions[0].tracks[1].id");
    expect(errors[1].path).toBe("motions[0].tracks[2].id");
  });

  it("should error on duplicate bare top-level track IDs", () => {
    const schema = { tracks: [{ id: "free" }, { id: "free" }] };
    const errors = elementUniquenessRule([], { schema });
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].path).toBe("tracks[1].id");
  });

  it("should warn, not error, when a bare top-level ID shadows a motion-local ID", () => {
    const schema = { tracks: [{ id: "el-1" }] };
    const errors = elementUniquenessRule([{ tracks: [{ id: "el-1" }] }], {
      schema,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("warning");
    expect(errors[0].message).toContain("ambiguous");
    expect(errors[0].path).toBe("tracks[0].id");
  });

  it("should skip missing/empty IDs and survive garbage input", () => {
    expect(elementUniquenessRule(undefined)).toHaveLength(0);
    expect(elementUniquenessRule("nope")).toHaveLength(0);
    expect(
      elementUniquenessRule([
        { tracks: [{ id: "" }, { id: "" }, null, 7, { nope: true }] },
        null,
      ]),
    ).toHaveLength(0);
  });
});
