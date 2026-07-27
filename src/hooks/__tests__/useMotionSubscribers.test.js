// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useMotionSubscribers from "../useMotionSubscribers";
import { gsap } from "gsap";

vi.mock("gsap", () => ({ gsap: { set: vi.fn() } }));

describe("useMotionSubscribers", () => {
  let mockInstances;
  let mockCallbacks;
  let mockUnsubscribes;
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallbacks = {};
    mockUnsubscribes = [vi.fn(), vi.fn()];
    mockInstances = [
      {
        id: "inst-0",
        subscribe: vi.fn((id, cb) => {
          mockCallbacks["inst-0::" + id] = cb;
          return mockUnsubscribes[0];
        }),
        compose: vi.fn((id, raw) => ({ x: raw.x })),
      },
      {
        id: "inst-1",
        subscribe: vi.fn((id, cb) => {
          mockCallbacks["inst-1::" + id] = cb;
          return mockUnsubscribes[1];
        }),
        compose: vi.fn((id, raw) => ({ opacity: raw.opacity })),
      },
    ];
  });

  it("merges disjoint keys correctly from multiple sources", () => {
    const ref = { current: document.createElement("div") };
    renderHook(() =>
      useMotionSubscribers(
        [
          { instance: mockInstances[0], trackId: "track-0" },
          { instance: mockInstances[1], trackId: "track-1" },
        ],
        ref,
      ),
    );
    mockCallbacks["inst-0::track-0"]({ x: 100 });
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { x: 100 });
    mockCallbacks["inst-1::track-1"]({ opacity: 0.8 });
    // The merged logical patch contains both keys, but Phase 7's renderer
    // correctly emits only the newly dirty key on the second write.
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { opacity: 0.8 });
  });

  it("preserves later-source precedence for overlapping keys", () => {
    const ref = { current: document.createElement("div") };
    mockInstances[0].compose.mockReturnValue({ opacity: 0.2 });
    mockInstances[1].compose.mockReturnValue({ opacity: 0.9 });
    renderHook(() =>
      useMotionSubscribers(
        [
          { instance: mockInstances[0], trackId: "track-0" },
          { instance: mockInstances[1], trackId: "track-1" },
        ],
        ref,
      ),
    );
    mockCallbacks["inst-1::track-1"]({});
    mockCallbacks["inst-0::track-0"]({});
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { opacity: 0.9 });
  });

  it("uses custom mergeFn when provided", () => {
    const ref = { current: document.createElement("div") };
    mockInstances[0].compose.mockReturnValue({ opacity: 0.2 });
    mockInstances[1].compose.mockReturnValue({ opacity: 0.9 });
    const mergeFn = vi.fn((patches) =>
      Object.assign({}, ...[...patches].reverse()),
    );
    renderHook(() =>
      useMotionSubscribers(
        [
          { instance: mockInstances[0], trackId: "track-0" },
          { instance: mockInstances[1], trackId: "track-1" },
        ],
        ref,
        mergeFn,
      ),
    );
    mockCallbacks["inst-0::track-0"]({});
    mockCallbacks["inst-1::track-1"]({});
    expect(mergeFn).toHaveBeenCalled();
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { opacity: 0.2 });
  });

  it("lets transformFn own boundary behavior", () => {
    const ref = { current: document.createElement("div") };
    mockInstances[0].compose.mockReturnValue({ x: 50 });
    const transformFn = (raw, compose) =>
      raw.pathProgress <= 0 || raw.pathProgress >= 1
        ? { display: "none" }
        : { ...compose(raw), display: "flex" };
    renderHook(() =>
      useMotionSubscribers(
        [{ instance: mockInstances[0], trackId: "track-0", transformFn }],
        ref,
      ),
    );
    mockCallbacks["inst-0::track-0"]({ pathProgress: 0.5 });
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, {
      x: 50,
      display: "flex",
    });
    mockCallbacks["inst-0::track-0"]({ pathProgress: 0 });
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { display: "none" });
  });

  it("does not resubscribe identical sources", () => {
    const ref = { current: document.createElement("div") };
    const { rerender } = renderHook(
      ({ sources }) => useMotionSubscribers(sources, ref),
      {
        initialProps: {
          sources: [
            { instance: mockInstances[0], trackId: "track-0" },
            { instance: mockInstances[1], trackId: "track-1" },
          ],
        },
      },
    );
    rerender({
      sources: [
        { instance: mockInstances[0], trackId: "track-0" },
        { instance: mockInstances[1], trackId: "track-1" },
      ],
    });
    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1);
    expect(mockInstances[1].subscribe).toHaveBeenCalledTimes(1);
  });

  it("resubscribes when a source trackId changes", () => {
    const ref = { current: document.createElement("div") };
    const { rerender } = renderHook(
      ({ id }) =>
        useMotionSubscribers(
          [{ instance: mockInstances[0], trackId: id }],
          ref,
        ),
      { initialProps: { id: "track-0" } },
    );
    rerender({ id: "track-new" });
    expect(mockUnsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(2);
  });

  it("uses the latest transformFn without resubscribing", () => {
    const ref = { current: document.createElement("div") };
    const fn1 = vi.fn(() => ({ scale: 1 }));
    const fn2 = vi.fn(() => ({ scale: 2 }));
    const { rerender } = renderHook(
      ({ transform }) =>
        useMotionSubscribers(
          [
            {
              instance: mockInstances[0],
              trackId: "track-0",
              transformFn: transform,
            },
          ],
          ref,
        ),
      { initialProps: { transform: fn1 } },
    );
    rerender({ transform: fn2 });
    mockCallbacks["inst-0::track-0"]({});
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { scale: 2 });
  });

  it("uses the latest anchor without resubscribing", () => {
    const ref = { current: document.createElement("div") };
    mockInstances[0].compose.mockReturnValue({ x: 100, y: 50 });
    const { rerender } = renderHook(
      ({ anchor }) =>
        useMotionSubscribers(
          [{ instance: mockInstances[0], trackId: "track-0", anchor }],
          ref,
        ),
      { initialProps: { anchor: { offset: { x: 10, y: 0 } } } },
    );
    mockCallbacks["inst-0::track-0"]({});
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { x: 110, y: 50 });
    rerender({ anchor: { offset: { x: -25, y: 5 } } });
    mockCallbacks["inst-0::track-0"]({});
    expect(mockInstances[0].subscribe).toHaveBeenCalledTimes(1);
    expect(gsap.set).toHaveBeenLastCalledWith(ref.current, { x: 75, y: 55 });
  });
});
