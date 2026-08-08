import { describe, expect, it, vi, beforeEach } from "vitest";
import { gsapTickerClock } from "../gsap/gsapTickerClock.js";
import { assertClock, createTickClock } from "../../ports/Clock.js";
import { gsap } from "gsap";

vi.mock("gsap", () => ({ gsap: { ticker: { add: vi.fn(), remove: vi.fn() } } }));

describe("P2-02 relocated GSAP ticker clock adapter", () => {
  beforeEach(() => {
    gsap.ticker.add.mockClear();
    gsap.ticker.remove.mockClear();
  });

  it("satisfies the Clock port contract", () => {
    expect(() => assertClock(gsapTickerClock, "gsapTickerClock")).not.toThrow();
  });

  it("adds exactly one ticker callback per subscription and removes it on unsubscribe", () => {
    const unsubscribe = gsapTickerClock.subscribe(() => {});
    expect(gsap.ticker.add).toHaveBeenCalledTimes(1);
    expect(gsap.ticker.remove).not.toHaveBeenCalled();
    unsubscribe();
    expect(gsap.ticker.remove).toHaveBeenCalledTimes(1);
    expect(gsap.ticker.remove.mock.calls[0][0]).toBe(gsap.ticker.add.mock.calls[0][0]);
  });

  it("forwards the raw millisecond delta unchanged", () => {
    const seen = [];
    gsapTickerClock.subscribe((delta) => seen.push(delta));
    const callback = gsap.ticker.add.mock.calls[0][0];
    callback(0, 16.7);
    callback(0, undefined);
    expect(seen).toEqual([16.7, 0]);
  });

  it("multiplexes through createTickClock into the { tick, delta } contract", () => {
    const clock = createTickClock(gsapTickerClock);
    const seen = [];
    const a = clock.subscribe((event) => seen.push(["a", event.tick]));
    const b = clock.subscribe((event) => seen.push(["b", event.tick]));
    expect(gsap.ticker.add).toHaveBeenCalledTimes(1);
    const callback = gsap.ticker.add.mock.calls[0][0];
    callback(0, 16);
    expect(seen).toEqual([["a", 1], ["b", 1]]);
    a();
    b();
    expect(gsap.ticker.remove).toHaveBeenCalledTimes(1);
    clock.dispose();
  });
});
