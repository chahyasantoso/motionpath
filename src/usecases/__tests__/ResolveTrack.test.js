import { describe, it, expect } from "vitest";
import { resolveTrack, resolveTrackKeyframes } from "../ResolveTrack.js";

describe("templateResolver", () => {
  describe("resolveTrackKeyframes", () => {
    it("returns empty object if no template or track keyframes exist", () => {
      expect(resolveTrackKeyframes(null, null)).toEqual({});
    });

    it("returns template keyframes if track has no keyframes", () => {
      const template = { keyframes: { x: { stops: [{ p: 0, v: 10 }] } } };
      expect(resolveTrackKeyframes(template, null)).toEqual({
        x: { stops: [{ p: 0, v: 10 }] },
      });
    });

    it("replaces property keys entirely when track has keyframes overrides", () => {
      const template = {
        keyframes: {
          x: {
            stops: [
              { p: 0, v: 10 },
              { p: 1, v: 20 },
            ],
          },
          y: { stops: [{ p: 0, v: 5 }] },
        },
      };
      const track = {
        keyframes: {
          x: { stops: [{ p: 0, v: 100 }] },
        },
      };
      expect(resolveTrackKeyframes(template, track)).toEqual({
        x: { stops: [{ p: 0, v: 100 }] },
        y: { stops: [{ p: 0, v: 5 }] },
      });
    });
  });

  describe("resolveTrack", () => {
    it("returns null if track is falsy", () => {
      expect(resolveTrack(null)).toBeNull();
    });

    it("resolves track with no template use correctly", () => {
      const track = { id: "tr1", duration: 1, keyframes: { x: { stops: [] } } };
      expect(resolveTrack(track, [])).toEqual(track);
    });

    it("resolves track using templates list and overrides duration/transformOrigin", () => {
      const templates = [
        {
          templateId: "t1",
          duration: 0.5,
          transformOrigin: "50% 50%",
          keyframes: { x: { stops: [{ p: 0, v: 1 }] } },
        },
      ];

      // Track inherits template values when not overridden
      const track1 = { id: "tr1", use: "t1" };
      expect(resolveTrack(track1, templates)).toEqual({
        id: "tr1",
        use: "t1",
        duration: 0.5,
        transformOrigin: "50% 50%",
        keyframes: { x: { stops: [{ p: 0, v: 1 }] } },
      });

      // Track overrides template values when specified locally
      const track2 = {
        id: "tr1",
        use: "t1",
        duration: 2.0,
        transformOrigin: "0% 0%",
        keyframes: { y: { stops: [{ p: 1, v: 2 }] } },
      };
      expect(resolveTrack(track2, templates)).toEqual({
        id: "tr1",
        use: "t1",
        duration: 2.0,
        transformOrigin: "0% 0%",
        keyframes: {
          x: { stops: [{ p: 0, v: 1 }] },
          y: { stops: [{ p: 1, v: 2 }] },
        },
      });
    });
  });
});
