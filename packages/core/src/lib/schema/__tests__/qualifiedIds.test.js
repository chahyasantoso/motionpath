import { describe, expect, it } from "vitest";
import { Engine } from "../../../engines/Engine.js";

const stops = { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] };
const project = { schemaVersion: 4, projectId: "qualified", motions: [{ id: "left", trigger: { type: "manual" }, tracks: [{ id: "bone", keyframes: { opacity: stops } }] }, { id: "right", trigger: { type: "manual" }, tracks: [{ id: "bone", keyframes: { opacity: stops } }] }], tracks: [] };

describe("qualified project-local IDs", () => {
  it("mounts duplicate motion-local track IDs by qualified ID", async () => { const engine = new Engine(); await engine.loadProject(project); const left = engine.mountInstance("left/bone"); const right = engine.mountInstance("right/bone"); expect(left.id).toBe("bone"); expect(right.id).toBe("bone"); expect(left.motionId).toBe("left"); expect(right.motionId).toBe("right"); engine.destroy(); });
  it("rejects duplicate qualified IDs during parse", async () => { const engine = new Engine(); const clashing = { ...project, motions: [{ id: "left", trigger: { type: "manual" }, tracks: [{ id: "bone", keyframes: { opacity: stops } }, { id: "bone", keyframes: { opacity: stops } }] }] }; await expect(engine.loadProject(clashing)).rejects.toThrow(/Duplicate qualified track id/); });
});
