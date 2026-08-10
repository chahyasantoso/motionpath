import { describe, expect, it } from "vitest";
import { assertClock, createManualClock } from "../Clock.js";
import { assertInterpolator } from "../Interpolator.js";
import { assertScheduler } from "../Scheduler.js";

describe("PR-12 renderer-neutral ports", () => {
  it("provides a deterministic clock without GSAP", () => {
    const clock = createManualClock();
    const seen = [];
    assertClock(clock).subscribe((event) => seen.push(event));
    clock.tick(0.25);
    expect(seen).toEqual([{ tick: 1, delta: 0.25 }]);
  });
  it("rejects incomplete implementations at the boundary", () => {
    expect(() => assertClock({})).toThrow(/subscribe/);
    expect(() => assertInterpolator({})).toThrow(/create/);
    expect(() => assertScheduler({})).toThrow(/to\(target/);
  });
});
