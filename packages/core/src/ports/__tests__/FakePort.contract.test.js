import { describe, expect, it } from "vitest";
import { assertClock, createManualClock, createTickClock } from "../Clock.js";
import { assertInterpolator } from "../Interpolator.js";
import { assertScheduler } from "../Scheduler.js";

describe("P2-02 renderer-neutral port contracts", () => {
  it("accepts fake scheduler and interpolator ports without GSAP", () => {
    const scheduler = {
      to: () => ({ kill() {} }),
      timeline: () => ({ add() {}, render() {}, kill() {} }),
    };
    const interpolator = {
      create: () => ({ progress() {}, duration: () => 0, kill() {} }),
    };
    expect(assertScheduler(scheduler)).toBe(scheduler);
    expect(assertInterpolator(interpolator)).toBe(interpolator);
  });

  it("normalizes manual and numeric clock events through the renderer-neutral clock", () => {
    const manual = createManualClock();
    const seen = [];
    const clock = createTickClock(manual);
    assertClock(clock).subscribe((event) => seen.push(event));
    manual.tick(0.25);
    expect(seen).toEqual([{ tick: 1, delta: 0.25 }]);
    clock.dispose();
  });
});
