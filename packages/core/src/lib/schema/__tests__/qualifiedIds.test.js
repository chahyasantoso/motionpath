import { describe, expect, it } from "vitest";
import { Engine } from "../../../engines/Engine.js";

const stops = {
  stops: [
    { p: 0, v: 0 },
    { p: 1, v: 1 },
  ],
};
const track = (id) => ({ id, keyframes: { opacity: stops } });
const motion = (id, ...tracks) => ({ id, trigger: { type: "manual" }, tracks });
const project = (...motions) => ({
  schemaVersion: 4,
  projectId: "qualified",
  motions,
});

describe("qualified project-local IDs", () => {
  it("mounts duplicate motion-local track IDs by qualified ID", async () => {
    const engine = new Engine();
    await engine.loadProject(
      project(motion("left", track("bone")), motion("right", track("bone"))),
    );
    const left = engine.mountInstance("left/bone");
    const right = engine.mountInstance("right/bone");
    expect(left).not.toBe(right);
    expect(left.id).toBe("bone");
    expect(right.id).toBe("bone");
    expect(left.motionId).toBe("left");
    expect(right.motionId).toBe("right");
    engine.destroy();
  });

  it("treats bare authored IDs as motion-local, so cross-motion duplicates validate clean", async () => {
    const engine = new Engine();
    await engine.loadProject(
      project(motion("left", track("bone")), motion("right", track("bone"))),
    );
    expect(engine.validationReport).toEqual([]);
    engine.destroy();
  });

  it("rejects duplicate qualified IDs during parse", async () => {
    const engine = new Engine();
    await expect(
      engine.loadProject(
        project(motion("left", track("bone"), track("bone"))),
        { validate: false },
      ),
    ).rejects.toThrow(/Duplicate qualified track id "left\/bone"/);
  });

  it("rejects duplicate motion-local track IDs at validation too", async () => {
    const engine = new Engine();
    await expect(
      engine.loadProject(project(motion("left", track("bone"), track("bone")))),
    ).rejects.toThrow(/Duplicate track ID 'bone'/);
  });

  it("mounts bare top-level tracks through the ~ namespace", async () => {
    const engine = new Engine();
    await engine.loadProject({
      ...project(motion("left", track("bone"))),
      tracks: [track("floater")],
    });
    const free = engine.mountInstance("~/floater");
    expect(free.id).toBe("floater");
    expect(free.trackId).toBe("floater");
    expect(free.motionId).toBeUndefined();
    engine.destroy();
  });

  it("accepts an empty top-level tracks array", async () => {
    const engine = new Engine();
    await engine.loadProject({
      ...project(motion("left", track("bone"))),
      tracks: [],
    });
    expect(engine.validationReport).toEqual([]);
    engine.destroy();
  });

  it("refuses to guess when a bare ID is ambiguous", async () => {
    const engine = new Engine();
    await engine.loadProject({
      ...project(motion("left", track("bone"))),
      tracks: [track("bone")],
    });
    expect(engine.validationReport.map((error) => error.severity)).toEqual([
      "warning",
    ]);
    expect(() => engine.mountInstance("bone")).toThrow(
      /Ambiguous track id "bone"/,
    );
    expect(engine.mountInstance("left/bone").motionId).toBe("left");
    expect(engine.mountInstance("~/bone").motionId).toBeUndefined();
    engine.destroy();
  });

  it("reserves the qualified-ID separator and the free-track namespace", async () => {
    await expect(
      new Engine().loadProject(project(motion("~", track("bone"))), {
        validate: false,
      }),
    ).rejects.toThrow(/reserved for the free-track namespace/);
    await expect(
      new Engine().loadProject(project(motion("left", track("a/b"))), {
        validate: false,
      }),
    ).rejects.toThrow(/reserved for qualified ids/);
    await expect(
      new Engine().loadProject(project(motion("a/b", track("bone"))), {
        validate: false,
      }),
    ).rejects.toThrow(/reserved for qualified ids/);
  });

  it("leaves malformed IDs to the validator instead of throwing in the parser (R-02)", async () => {
    // A motion with no `id` must keep its documented legacy failure mode under
    // { validate: false }: registered under the key `undefined`, unmountable.
    // The namespace guard must not turn that into a parse error.
    const engine = new Engine();
    const anonymous = {
      schemaVersion: 4,
      motions: [{ trigger: { type: "manual" }, tracks: [track("bone")] }],
    };
    await expect(
      engine.loadProject(anonymous, { validate: false }),
    ).resolves.toBeUndefined();
    expect(() => engine.mountInstance("legacy")).toThrow(
      /not found in project/,
    );
    engine.destroy();
  });

  it("remounting a qualified ID yields independent instances", async () => {
    const engine = new Engine();
    await engine.loadProject(project(motion("left", track("bone"))));
    const first = engine.mountInstance("left/bone");
    const second = engine.mountInstance("left/bone");
    expect(first).not.toBe(second);
    expect(second.id).toBe(first.id);
    engine.unmount(first);
    expect(first.isDestroyed).toBe(true);
    expect(second.isDestroyed).toBe(false);
    engine.destroy();
  });
});
