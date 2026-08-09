import { describe, expect, it } from "vitest";
import { createObservationOwner } from "../createObservationOwner.js";

function track(id, value) {
  return {
    id,
    getSnapshot: () => ({ value }),
    composeLocal: (raw) => ({ value: raw?.value ?? value }),
  };
}

describe("P2-03 scoped ownership seam", () => {
  it("keeps two owners isolated even when public IDs collide", () => {
    const left = track("bone", "left");
    const right = track("bone", "right");
    const leftOwner = createObservationOwner();
    const rightOwner = createObservationOwner();

    leftOwner.register(left, "left#bone");
    rightOwner.register(right, "right#bone");

    expect(leftOwner.getTrack("left#bone")).toBe(left);
    expect(leftOwner.getTrack("right#bone")).toBeNull();
    expect(rightOwner.getTrack("right#bone")).toBe(right);

    leftOwner.destroy();
    expect(rightOwner.getTrack("right#bone")).toBe(right);
    rightOwner.destroy();
  });

  it("has an explicit lifecycle boundary", () => {
    const owner = createObservationOwner();
    owner.destroy();
    expect(owner.isDestroyed).toBe(true);
    expect(() => owner.register(track("dead", 0), "dead#track")).toThrow(
      /destroyed/i,
    );
  });
});
