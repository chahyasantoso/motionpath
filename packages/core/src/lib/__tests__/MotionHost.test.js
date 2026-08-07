import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../../engines/Engine.js";

function project() { return { schemaVersion: 4, projectId: "motion-host-test", motions: [{ id: "ball-template-motion", trigger: { type: "time", autoplay: false }, tracks: [{ id: "ball-track", duration: 1, keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }], tracks: [] }; }

describe("Engine.createMotionHost", () => {
  let engine;
  afterEach(() => engine?.destroy());
  it("creates a Motion-owned dynamic host", async () => {
    engine = new Engine(); await engine.loadProject(project());
    const { motion, track: host } = engine.createMotionHost({ id: "spiral-parent", autoplay: true });
    const child = engine.createTrackInstance("ball-track", { id: "ball-1" });
    host.addChild(child, { stagger: 0.5 });
    expect(host.childCount).toBe(1); expect(child.isMounted).toBe(true); expect(engine.isOwned(motion)).toBe(true);
    motion.pause(); motion.seek(0); motion.play(); host.removeChild("ball-1");
    expect(host.childCount).toBe(0); expect(engine.unmount(motion)).toBe(true); expect(engine.isOwned(child)).toBe(true); engine.unmount(child);
  });
  it("rejects an empty host id", async () => { engine = new Engine(); await engine.loadProject(project()); expect(() => engine.createMotionHost({ id: "" })).toThrow("id must be a non-empty string"); });
});
