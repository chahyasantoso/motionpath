import { afterEach, describe, expect, it } from "vitest";
import { Engine } from "../../engines/Engine.js";
import { CompositeRuntime } from "../CompositeRuntime.js";
import { compareShadowPatches } from "../FixtureShadow.js";

const project = { schemaVersion: 4, projectId: "spiral-shadow", motions: [{ id: "ball-template-motion", trigger: { type: "time", autoplay: false }, tracks: [{ id: "ball-track", duration: 1, keyframes: { opacity: { stops: [{ p: 0, v: 0 }, { p: 1, v: 1 }] } } }] }], tracks: [{ id: "exit-track", duration: 0.2, keyframes: { scale: { stops: [{ p: 0, v: 1 }, { p: 1, v: 0 }] } } }] };
function setup() { const engine = new Engine(); return engine.loadProject(project).then(() => { const host = engine.createGroupHost({ id: "spiral-parent", staggerTransition: { duration: 0.1, ease: "power2.out" }, autoplay: true }); return { engine, host, composite: new CompositeRuntime(host) }; }); }
async function addBall(engine, host, composite, id) { const track = engine.createTrackInstance("ball-track", { id, duration: 1 }); host.addChild(track, { stagger: 0.1 }); composite.register(track); return track; }

describe("CompositeRuntime live Spiral shadow", () => {
  let engine;
  afterEach(() => engine?.destroy());
  it("shadows spawn, seek and reverse without changing host authority", async () => { const { engine: e, host, composite } = await setup(); engine = e; const first = await addBall(engine, host, composite, "ball-1"); const second = await addBall(engine, host, composite, "ball-2"); first.progress(0.25); second.progress(0.5); composite.runtime.publisher.markAllDirty(); composite.flush(); const result = composite.shadow(); expect(compareShadowPatches(result.legacy, result.published)).toEqual({ equal: true, mismatches: [] }); host.seek(0.4); host.reverse(); expect(host.childCount).toBe(2); });
  it("shadows pop and reflow while preserving live child ownership", async () => { const { engine: e, host, composite } = await setup(); engine = e; await addBall(engine, host, composite, "ball-1"); const second = await addBall(engine, host, composite, "ball-2"); host.removeChild(second.id); composite.unregister(second.id); composite.runtime.publisher.markAllDirty(); composite.flush(); const result = composite.shadow(); expect(compareShadowPatches(result.legacy, result.published)).toEqual({ equal: true, mismatches: [] }); expect(second.isDestroyed).toBe(false); expect(host.childCount).toBe(1); });
  it("survives churn and disposes every runtime layer", async () => { const { engine: e, host, composite } = await setup(); engine = e; for (let i = 0; i < 5; i += 1) await addBall(engine, host, composite, `ball-${i}`); composite.runtime.publisher.markAllDirty(); composite.flush(); composite.dispose(); expect(composite.isDisposed).toBe(true); expect(() => composite.flush()).toThrow(/disposed/i); expect(host.childCount).toBe(5); });
});
