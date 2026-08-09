import { describe, expect, it } from "vitest";
import {
  observationEdgeEquals,
  observationEdgeKey,
} from "../observationEdge.js";

describe("observation edge identity", () => {
  it("separates concatenation-collision ids", () => {
    expect(observationEdgeKey("A", "output", "BC")).not.toBe(
      observationEdgeKey("AB", "output", "C"),
    );
  });

  it("distinguishes input and output edges", () => {
    expect(observationEdgeKey("source", "input", "parentWorld")).not.toBe(
      observationEdgeKey("source", "output"),
    );
  });

  it("compares normalized edge records by semantic identity", () => {
    expect(
      observationEdgeEquals(
        { source: "a", role: "input", input: "parentWorld" },
        { source: "a", role: "input", input: "parentWorld" },
      ),
    ).toBe(true);
    expect(
      observationEdgeEquals(
        { source: "a", role: "input", input: "x" },
        { source: "a", role: "input", input: "y" },
      ),
    ).toBe(false);
  });
});
