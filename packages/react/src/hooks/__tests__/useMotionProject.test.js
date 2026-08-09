// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import useMotionProject from "../useMotionProject";
import { engine } from "../../../../../packages/core/src/engines/Engine.js";

vi.mock("../../../../../packages/core/src/engines/Engine.js", () => ({
  engine: { loadProject: vi.fn(), destroy: vi.fn() },
}));

describe("useMotionProject", () => {
  let consoleErrorSpy;
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleErrorSpy.mockRestore());
  it("loads once and destroys on unmount", () => {
    engine.loadProject.mockResolvedValue();
    const project = { schemaVersion: 2, projectId: "p1", motions: [] };
    const { unmount } = renderHook(() => useMotionProject(project));
    expect(engine.loadProject).toHaveBeenCalledTimes(1);
    expect(engine.loadProject).toHaveBeenCalledWith(project);
    unmount();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });
  it("reloads when the project reference changes", () => {
    engine.loadProject.mockResolvedValue();
    const project1 = { schemaVersion: 2, projectId: "p1", motions: [] };
    const project2 = { schemaVersion: 2, projectId: "p2", motions: [] };
    const { rerender } = renderHook(
      ({ project }) => useMotionProject(project),
      { initialProps: { project: project1 } },
    );
    rerender({ project: project2 });
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(engine.loadProject).toHaveBeenCalledTimes(2);
  });
  it("logs load failure", async () => {
    const error = new Error("load failed");
    engine.loadProject.mockRejectedValue(error);
    renderHook(() =>
      useMotionProject({ schemaVersion: 2, projectId: "p1", motions: [] }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[useMotionProject] loadProject failed:",
      error,
    );
  });
  it("reloads on a new reference with the same id", () => {
    engine.loadProject.mockResolvedValue();
    const project = { schemaVersion: 2, projectId: "p1", motions: [] };
    const { rerender } = renderHook(({ p }) => useMotionProject(p), {
      initialProps: { p: project },
    });
    rerender({ p: { ...project } });
    expect(engine.loadProject).toHaveBeenCalledTimes(2);
  });
});
