// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useMotionTimelinePlayback from "../useMotionTimelinePlayback";

describe("useMotionTimelinePlayback", () => {
  let mockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstance = {
      play: vi.fn(),
      pause: vi.fn(),
    };
  });

  it("calls play when playing is true", () => {
    renderHook(() => useMotionTimelinePlayback(mockInstance, true));

    expect(mockInstance.play).toHaveBeenCalled();
    expect(mockInstance.pause).not.toHaveBeenCalled();
  });

  it("calls pause when playing is false", () => {
    renderHook(() => useMotionTimelinePlayback(mockInstance, false));

    expect(mockInstance.pause).toHaveBeenCalled();
    expect(mockInstance.play).not.toHaveBeenCalled();
  });

  it("calls correct function when playing status updates", () => {
    const { rerender } = renderHook(
      ({ playing }) => useMotionTimelinePlayback(mockInstance, playing),
      { initialProps: { playing: false } },
    );

    expect(mockInstance.pause).toHaveBeenCalled();
    vi.clearAllMocks();

    rerender({ playing: true });
    expect(mockInstance.play).toHaveBeenCalled();
  });

  it("ignores calls if instance is falsy", () => {
    renderHook(() => useMotionTimelinePlayback(null, true));

    expect(mockInstance.play).not.toHaveBeenCalled();
    expect(mockInstance.pause).not.toHaveBeenCalled();
  });
});
