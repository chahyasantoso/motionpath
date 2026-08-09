import { describe, expect, it } from "vitest";
import { parseV4Project } from "../../lib/schema/parseV4Project.js";
import { validateProject } from "../../validators/index.js";
import {
  CURRENT_SCHEMA_VERSION,
  OBSERVATION_ROLES,
  SUPPORTED_TRIGGER_TYPES,
} from "../v4.js";

const animatedOpacity = {
  opacity: {
    stops: [
      { p: 0, v: 0 },
      { p: 1, v: 1 },
    ],
  },
};

const fixtures = [
  {
    name: "manual motion with template and observation metadata",
    schema: {
      schemaVersion: 4,
      templates: [{ templateId: "fade", duration: 0.5 }],
      motions: [
        {
          id: "manual-motion",
          trigger: { type: "manual" },
          tracks: [
            {
              id: "source",
              use: "fade",
              keyframes: animatedOpacity,
            },
            {
              id: "child",
              observes: [
                { source: "source", role: "input", target: "parentWorld" },
              ],
              keyframes: {
                x: {
                  stops: [
                    { p: 0, v: 0 },
                    { p: 1, v: 10 },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
  },
  {
    name: "time motion",
    schema: {
      schemaVersion: 4,
      motions: [
        {
          id: "time-motion",
          trigger: { type: "time", autoplay: false },
          tracks: [{ id: "time-track", keyframes: animatedOpacity }],
        },
      ],
    },
  },
  {
    name: "scrubbed scroll motion",
    schema: {
      schemaVersion: 4,
      motions: [
        {
          id: "scroll-motion",
          trigger: { type: "scroll", scrub: true },
          tracks: [{ id: "scroll-track", keyframes: animatedOpacity }],
        },
      ],
    },
  },
];

describe("v4 canonical contract", () => {
  it("exposes the supported contract vocabulary", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(SUPPORTED_TRIGGER_TYPES).toEqual(["scroll", "time", "manual"]);
    expect(OBSERVATION_ROLES).toEqual(["input", "output"]);
  });

  for (const fixture of fixtures) {
    it(`validates and parses: ${fixture.name}`, async () => {
      expect(
        validateProject(fixture.schema).filter(
          (error) => error.severity === "error",
        ),
      ).toEqual([]);
      await expect(parseV4Project(fixture.schema)).resolves.toMatchObject({
        getMotionConfig: expect.any(Function),
      });
    });
  }

  it("rejects unsupported schema versions with the canonical version", () => {
    const errors = validateProject({ schemaVersion: 3, motions: [] });
    expect(
      errors.find((error) => error.ruleId === "schema-version").message,
    ).toContain("must be 4");
  });
});
