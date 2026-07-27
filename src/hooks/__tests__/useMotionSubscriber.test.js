// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useMotionSubscriber from "../useMotionSubscriber";
import { gsap } from "gsap";

// Mock GSAP
vi.mock("gsap", () => ({
  gsap: {
    set: vi.fn(),
  },
}));

describe("useMotionSubscriber", () => {
  let mockInstance;
  let mockSubscribeCallback;
  const mockUnsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockInstance = {
      subscribe: vi.fn((id, cb) => {
        mockSubscribeCallback = cb;
        return mockUnsubscribe;
      }),
      compose: vi.fn((trackId, rawData) => ({
        x: rawData.x,
        y: rawData.y,
        rotation: rawData.rotation,
      })),
    };
  });

  it("should subscribe to instance with the correct trackId on mount and unsubscribe on unmount", () => {
    const mockRef = { current: document.createElement("div") };

    const { unmount } = renderHook(() =>
      useMotionSubscriber(mockInstance, "rocket-id", mockRef),
    );

    // Assert subscribe was called
    expect(mockInstance.subscribe).toHaveBeenCalledWith(
      "rocket-id",
      expect.any(Function),
    );

    // Unmount and verify unsubscribe is triggered
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("should apply spatial properties via compose when no custom transformFn is provided", () => {
    const mockElement = document.createElement("div");
    const mockRef = { current: mockElement };

    renderHook(() => useMotionSubscriber(mockInstance, "rocket-id", mockRef));

    // Broadcast new coordinates from the engine
    const data = { x: 120, y: 340, rotation: 90, progress: 0.5 };
    mockSubscribeCallback(data);

    // Verify compose was called
    expect(mockInstance.compose).toHaveBeenCalledWith("rocket-id", data);

    // Verify gsap.set was called with composed properties
    expect(gsap.set).toHaveBeenCalledWith(mockElement, {
      x: 120,
      y: 340,
      rotation: 90,
    });
  });

  it("should apply custom styling and animation configurations via transformFn if provided, passing compose as the second arg", () => {
    const mockElement = document.createElement("div");
    const mockRef = { current: mockElement };
    const transformFn = vi.fn((data, compose) => {
      const composed = compose(data);
      return {
        ...composed,
        scale: 0.5 + data.progress * 0.5,
        opacity: data.progress,
      };
    });

    renderHook(() =>
      useMotionSubscriber(mockInstance, "rocket-id", mockRef, transformFn),
    );

    // Broadcast coordinates
    const data = { x: 200, y: 150, rotation: 30, progress: 0.8 };
    mockSubscribeCallback(data);

    // Verify custom transformFn was executed with data and compose function
    expect(transformFn).toHaveBeenCalledWith(data, expect.any(Function));

    // Verify gsap.set was called with custom transformed properties
    expect(gsap.set).toHaveBeenCalledWith(mockElement, {
      x: 200,
      y: 150,
      rotation: 30,
      scale: 0.9,
      opacity: 0.8,
    });
  });

  it("should handle null or unmounted ref.current gracefully when coordinate updates are received", () => {
    const mockRef = { current: null };

    renderHook(() => useMotionSubscriber(mockInstance, "rocket-id", mockRef));

    // Send update
    const data = { x: 100, y: 100, rotation: 0, progress: 0 };

    // Should not throw error
    expect(() => mockSubscribeCallback(data)).not.toThrow();
    expect(gsap.set).not.toHaveBeenCalled();
  });

  it("should call instance.subscribe exactly once per mount (no double-subscription or excessive hook call overhead)", () => {
    const mockRef = { current: document.createElement("div") };

    renderHook(() => useMotionSubscriber(mockInstance, "rocket-id", mockRef));

    expect(mockInstance.subscribe).toHaveBeenCalledTimes(1);
  });
});
