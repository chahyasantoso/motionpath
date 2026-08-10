import { describe, expect, it } from "vitest";
import { normalizeProject } from "../normalizeProject.js";

const authored = {
  schemaVersion: 4,
  templates: [
    {
      templateId: "fade",
      duration: 0.75,
      transformOrigin: "center",
      keyframes: {
        opacity: {
          stops: [
            { p: 0, v: 0 },
            { p: 1, v: 1 },
          ],
        },
      },
    },
  ],
  motions: [
    {
      id: "hero",
      trigger: { type: "manual" },
      tracks: [{ id: "hero-track", use: "fade" }],
    },
  ],
};

describe("normalizeProject", () => {
  it("resolves templates once into immutable track configs", () => {
    const normalized = normalizeProject(authored);
    const track = normalized.motions[0].tracks[0];
    expect(track.__normalized).toBe(true);
    expect(track.duration).toBe(0.75);
    expect(track.transformOrigin).toBe("center");
    expect(track.keyframes.opacity.stops).toHaveLength(2);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(track)).toBe(true);
    expect(authored.motions[0].tracks[0].use).toBe("fade");
    expect(authored.motions[0].tracks[0].duration).toBeUndefined();
  });

  it("does not mutate authored keyframe overrides while merging templates", () => {
    const input = {
      ...authored,
      motions: [
        {
          ...authored.motions[0],
          tracks: [
            {
              id: "hero-track",
              use: "fade",
              keyframes: {
                x: {
                  stops: [
                    { p: 0, v: 1 },
                    { p: 1, v: 2 },
                  ],
                },
              },
            },
          ],
        },
      ],
    };
    const normalized = normalizeProject(input);
    expect(normalized.motions[0].tracks[0].keyframes).toEqual({
      opacity: authored.templates[0].keyframes.opacity,
      x: input.motions[0].tracks[0].keyframes.x,
    });
    expect(normalized.motions[0].tracks[0].keyframes).not.toBe(
      input.motions[0].tracks[0].keyframes,
    );
    expect(input.motions[0].tracks[0].keyframes).toEqual({
      x: {
        stops: [
          { p: 0, v: 1 },
          { p: 1, v: 2 },
        ],
      },
    });
  });
});
