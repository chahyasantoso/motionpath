import { describe, it, expect } from "vitest";
import { ScrollTriggerDelegate } from "../TriggerDelegate.js";

// buildTimelineVars() is the pure half of build() -- it produces the object
// handed to gsap.timeline(), so it can be asserted without a live DOM.
describe("ScrollTriggerDelegate timeline vars", () => {
  it("applies repeat/yoyo/repeatDelay on a non-scrub (toggleActions) trigger", () => {
    const vars = new ScrollTriggerDelegate({
      scrub: false,
      start: "50% top",
      toggleActions: "play pause resume pause",
      repeat: -1,
      yoyo: true,
      repeatDelay: 0.25,
      delay: 0.5,
    }).buildTimelineVars();

    expect(vars.repeat).toBe(-1);
    expect(vars.yoyo).toBe(true);
    expect(vars.repeatDelay).toBe(0.25);
    expect(vars.delay).toBe(0.5);
    expect(vars.scrollTrigger.toggleActions).toBe("play pause resume pause");
  });

  it("leaves loop vars off a scrubbed trigger, where the playhead is scroll", () => {
    const vars = new ScrollTriggerDelegate({
      scrub: 0.5,
      start: "top top",
      end: "bottom bottom",
    }).buildTimelineVars();

    expect(vars.repeat).toBeUndefined();
    expect(vars.yoyo).toBeUndefined();
    expect(vars.repeatDelay).toBeUndefined();
    expect(vars.delay).toBeUndefined();
    expect(vars.scrollTrigger.scrub).toBe(0.5);
  });

  it("passes the trigger and pin elements straight through", () => {
    const trigger = { nodeType: 1, tag: "section" };
    const pin = { nodeType: 1, tag: "stage" };
    const vars = new ScrollTriggerDelegate({
      scrub: true,
      trigger,
      pin,
    }).buildTimelineVars();

    expect(vars.scrollTrigger.trigger).toBe(trigger);
    expect(vars.scrollTrigger.pin).toBe(pin);
  });
});
