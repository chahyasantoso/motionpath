import { describe, expect, it } from "vitest";
import { ProjectRuntime } from "../ProjectRuntime.js";

const project = (projectId) => ({ projectId });

describe("ProjectRuntime staged visibility", () => {
  it("keeps a candidate invisible until commit", () => {
    const runtime = new ProjectRuntime();
    const candidate = runtime.beginCandidate(project("next"));
    runtime.registerCandidate(candidate, "left/bone", { id: "bone" });
    expect(runtime.project).toBeNull();
    expect(runtime.candidateProject.projectId).toBe("next");
    expect(runtime.candidateMembership.has("left/bone")).toBe(true);
    runtime.commitCandidate(candidate);
    expect(runtime.project.projectId).toBe("next");
    expect(runtime.membership.get("left/bone").value.id).toBe("bone");
  });

  it("rejects duplicate candidate membership before visibility", () => {
    const runtime = new ProjectRuntime();
    const candidate = runtime.beginCandidate(project("next"));
    runtime.registerCandidate(candidate, "left/bone", {});
    expect(() => runtime.registerCandidate(candidate, "left/bone", {})).toThrow(/already registers/);
    runtime.abortCandidate(candidate);
  });

  it("rolls back a candidate without touching the active project", () => {
    const runtime = new ProjectRuntime();
    const first = runtime.beginCandidate(project("first")); runtime.commitCandidate(first);
    const second = runtime.beginCandidate(project("second"));
    const abandoned = { destroy: () => { abandoned.destroyed = true; } };
    runtime.registerCandidate(second, "track", abandoned); runtime.abortCandidate(second);
    expect(runtime.project.projectId).toBe("first"); expect(abandoned.destroyed).toBe(true);
  });

  it("owns one graph runtime and disposes replacement and final graph exactly once", () => {
    const runtime = new ProjectRuntime(); const candidate = runtime.beginCandidate(project("active")); runtime.commitCandidate(candidate);
    const first = { flush: () => 3, dispose: () => { first.disposed = (first.disposed ?? 0) + 1; }, getPatch: () => null, subscribe: () => () => {} };
    const second = { flush: () => 4, dispose: () => { second.disposed = (second.disposed ?? 0) + 1; }, getPatch: () => null, subscribe: () => () => {} };
    runtime.attachGraphRuntime(first); expect(runtime.flush()).toBe(3); runtime.attachGraphRuntime(second); expect(first.disposed).toBe(1); runtime.dispose(); expect(second.disposed).toBe(1); runtime.dispose(); expect(second.disposed).toBe(1);
  });

  it("registers and disposes committed instances exactly once", () => {
    const runtime = new ProjectRuntime(); const candidate = runtime.beginCandidate(project("active")); runtime.commitCandidate(candidate); let destroys = 0;
    const object = { destroy: () => { destroys += 1; } }; runtime.registerInstance("motion#1", object); expect(runtime.instanceCount).toBe(1); expect(runtime.unregisterInstance("motion#1")).toBe(true); expect(destroys).toBe(1); runtime.dispose(); expect(destroys).toBe(1);
  });

  it("rejects a second candidate and remains disposable", () => {
    const runtime = new ProjectRuntime(); const candidate = runtime.beginCandidate(project("active")); expect(() => runtime.beginCandidate(project("other"))).toThrow(/already has a candidate/); runtime.abortCandidate(candidate, { destroy: false }); expect(() => runtime.beginCandidate(project("other"))).not.toThrow();
  });
});
