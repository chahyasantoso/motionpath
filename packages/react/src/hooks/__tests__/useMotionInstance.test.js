// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import useMotionInstance from "../useMotionInstance";
import { engine } from "@motionpath/core/engines/Engine";

vi.mock("../../engines/Engine.js", () => {
  const mockInstance = {
    id: "mock-inst",
    motionId: "my-motion",
    destroy: vi.fn(),
  };
  return {
    engine: {
      mountInstance: vi.fn(() => mockInstance),
    },
  };
});

describe("useMotionInstance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mounts by id and does not remount when the component rerenders", () => {
    const { rerender, unmount } = renderHook(
      ({ motionId }) => useMotionInstance(motionId),
      { initialProps: { motionId: "my-motion" } },
    );

    expect(engine.mountInstance).toHaveBeenCalledTimes(1);
    expect(engine.mountInstance).toHaveBeenCalledWith("my-motion");

    rerender({ motionId: "my-motion" });
    expect(engine.mountInstance).toHaveBeenCalledTimes(1);

    unmount();
    const inst = engine.mountInstance.mock.results[0].value;
    expect(inst.destroy).toHaveBeenCalledTimes(1);
  });
});
