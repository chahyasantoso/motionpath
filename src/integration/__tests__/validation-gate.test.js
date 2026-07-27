import { describe, it, expect } from "vitest";
import { Engine } from "../../engines/Engine.js";
import { validateProject, hasFatalErrors } from "../../validators/index.js";
import { MotionPathValidationError } from "../../errors/MotionPathValidationError.js";
import { v4Project } from "../fixtures/v4-project.js";

const fatal = (errors) => errors.filter((e) => e.severity === "error");

describe("integration: the validator is the executable spec (R-01, R-02)", () => {
  it("the canonical fixture has zero fatal validation errors", () => {
    const errors = validateProject(v4Project);
    expect(fatal(errors)).toEqual([]);
  });

  it("a schema that validates also loads", async () => {
    const engine = new Engine();
    await expect(engine.loadProject(v4Project)).resolves.toBeUndefined();
    engine.destroy();
  });

  it("loadProject throws MotionPathValidationError and builds nothing", async () => {
    const engine = new Engine();
    const bad = {
      schemaVersion: 4,
      motions: [
        {
          id: "broken",
          trigger: { type: "definitely-not-registered" },
          tracks: [
            { id: "t", keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } } },
          ],
        },
      ],
    };

    await expect(engine.loadProject(bad)).rejects.toBeInstanceOf(
      MotionPathValidationError,
    );

    // Nothing was parsed, nothing was mounted, no plugin was loaded.
    expect(() => engine.mountInstance("broken")).toThrow(/project not loaded/);
    expect(engine.instanceCount).toBe(0);
  });

  it("reports EVERY violation, not just the first", async () => {
    const engine = new Engine();
    const bad = {
      schemaVersion: 4,
      motions: [
        {
          id: "broken",
          trigger: { type: "definitely-not-registered" },
          tracks: [
            { id: "t", keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } } },
          ],
        },
      ],
    };

    const err = await engine.loadProject(bad).catch((e) => e);
    expect(err).toBeInstanceOf(MotionPathValidationError);
    expect(err.fatalErrors.length).toBeGreaterThan(1);
    expect(err.message).toContain("trigger-shape");
    expect(err.message).toContain("stop-count");
  });

  it("a failed load leaves a previously loaded project untouched", async () => {
    const engine = new Engine();
    await engine.loadProject(v4Project);
    const before = engine.getTrackConfig("needle");
    expect(before).not.toBeNull();

    await expect(
      engine.loadProject({
        schemaVersion: 4,
        motions: [{ trigger: { type: "time" }, tracks: [] }],
      }),
    ).rejects.toBeInstanceOf(MotionPathValidationError);

    expect(engine.getTrackConfig("needle")).not.toBeNull();
    engine.destroy();
  });

  it("rejects motionId and demands id (R-02)", async () => {
    const legacy = {
      schemaVersion: 4,
      motions: [
        {
          motionId: "legacy",
          trigger: { type: "time" },
          tracks: [
            {
              id: "x",
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
        },
      ],
    };

    const errors = validateProject(legacy);
    expect(errors.some((e) => e.path === "motions[0].motionId")).toBe(true);
    expect(errors.some((e) => e.path === "motions[0].id")).toBe(true);

    const engine = new Engine();
    await expect(engine.loadProject(legacy)).rejects.toBeInstanceOf(
      MotionPathValidationError,
    );
  });

  it("a motionId-only project can never reach mountInstance", async () => {
    const legacy = {
      schemaVersion: 4,
      motions: [
        {
          motionId: "legacy",
          trigger: { type: "time" },
          tracks: [
            {
              id: "x",
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
        },
      ],
    };

    const engine = new Engine();
    // With { validate: false } the OLD failure mode is still observable: the
    // motion lands under the key `undefined` and is unmountable. That is
    // exactly what the validator now catches up front.
    await engine.loadProject(legacy, { validate: false });
    expect(() => engine.mountInstance("legacy")).toThrow(
      /not found in project/,
    );
    engine.destroy();
  });

  it("runs the full track rule set over standalone schema.tracks[] (R-01, part 2)", () => {
    const stampingOnly = {
      schemaVersion: 4,
      motions: [],
      tracks: [
        { id: "stamp", keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } } },
      ],
    };

    const errors = validateProject(stampingOnly);
    // Before this change only motion-structure ever saw top-level tracks, so a
    // one-stop property here was completely unvalidated.
    expect(
      errors.some(
        (e) =>
          e.ruleId === "stop-count" && String(e.path).startsWith("tracks[0]"),
      ),
    ).toBe(true);
  });

  it("{ validate: false } is an explicit opt-out for trusted callers", async () => {
    const engine = new Engine();
    const sloppy = {
      schemaVersion: 4,
      motions: [
        {
          id: "m",
          trigger: { type: "time" },
          tracks: [
            {
              id: "t",
              duration: 1,
              keyframes: { opacity: { stops: [{ p: 0, v: 0 }] } },
            },
          ],
        },
      ],
    };

    expect(hasFatalErrors(validateProject(sloppy))).toBe(true);
    await expect(
      engine.loadProject(sloppy, { validate: false }),
    ).resolves.toBeUndefined();
    engine.destroy();
  });
});
