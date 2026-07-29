import { describe, it, expect } from "vitest";
import { triggerShapeRule } from "../trigger-shape.js";

describe("trigger-shape rule", () => {
  it("should pass on valid scroll-scrub triggers", () => {
    const motion = {
      trigger: { type: "scroll", scrub: true, endTrigger: "#x" },
    };
    const errors = triggerShapeRule(motion, {}, "motions[0]");
    expect(errors).toHaveLength(0);
  });

  it("should error on scroll observer trigger with endTrigger", () => {
    const motion = {
      trigger: { type: "scroll", scrub: false, endTrigger: "#x" },
    };
    const errors = triggerShapeRule(motion, {}, "motions[0]");
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe("trigger-shape");
    expect(errors[0].severity).toBe("error");
    expect(errors[0].path).toBe("motions[0].trigger.endTrigger");
  });

  it("should pass on valid time triggers", () => {
    const motion = {
      trigger: { type: "time", duration: 2, repeat: -1 },
    };
    const errors = triggerShapeRule(motion, {}, "motions[0]");
    expect(errors).toHaveLength(0);
  });

  it("should error on scroll-scrub with repeat settings", () => {
    const motion = {
      trigger: { type: "scroll", scrub: true, repeat: -1 },
    };
    const errors = triggerShapeRule(motion, {}, "motions[0]");
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe("trigger-shape");
    expect(errors[0].path).toBe("motions[0].trigger");
  });

  it("should error on scroll-scrub with delay", () => {
    const motion = {
      trigger: { type: "scroll", scrub: true, delay: 1 },
    };
    const errors = triggerShapeRule(motion, {}, "motions[0]");
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe("motions[0].trigger.delay");
  });

  it("should error if trigger is missing or type is invalid", () => {
    expect(triggerShapeRule({}, {}, "motions[0]")).toHaveLength(1);
    expect(triggerShapeRule({ trigger: {} }, {}, "motions[0]")).toHaveLength(1);
    expect(
      triggerShapeRule({ trigger: { type: "invalid" } }, {}, "motions[0]"),
    ).toHaveLength(1);
  });

  it("should error if scrub is missing or not a boolean in scroll trigger", () => {
    const missingScrub = triggerShapeRule(
      { trigger: { type: "scroll" } },
      {},
      "motions[0]",
    );
    expect(missingScrub).toHaveLength(1);
    expect(missingScrub[0].path).toBe("motions[0].trigger.scrub");

    const invalidScrub = triggerShapeRule(
      { trigger: { type: "scroll", scrub: "yes" } },
      {},
      "motions[0]",
    );
    expect(invalidScrub).toHaveLength(1);
    expect(invalidScrub[0].path).toBe("motions[0].trigger.scrub");
  });

  it("should error if a track inside a scroll-scrub motion defines duration", () => {
    const motion = {
      trigger: { type: "scroll", scrub: true },
      tracks: [
        { id: "el-1", duration: 1.5, keyframes: {} },
        { id: "el-2", keyframes: {} },
      ],
    };
    const errors = triggerShapeRule(motion, {}, "motions[0]");
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe("trigger-shape");
    expect(errors[0].severity).toBe("error");
    expect(errors[0].message).toContain(
      "duration is incompatible with scroll-scrub triggers",
    );
    expect(errors[0].message).toContain("el-1");
    expect(errors[0].path).toBe("motions[0].tracks[0].duration");
  });

  it("should pass if a track defines duration in a time or scroll-observer motion", () => {
    const timeMotion = {
      trigger: { type: "time", duration: 3 },
      tracks: [{ id: "el-1", duration: 1.5, keyframes: {} }],
    };
    expect(triggerShapeRule(timeMotion, {}, "motions[0]")).toHaveLength(0);

    const observerMotion = {
      trigger: { type: "scroll", scrub: false },
      tracks: [{ id: "el-1", duration: 1.5, keyframes: {} }],
    };
    expect(triggerShapeRule(observerMotion, {}, "motions[0]")).toHaveLength(0);
  });
});
