// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useGraphPatchSubscriber from "../useGraphPatchSubscriber.js";

vi.mock("@motionpath/core/adapters/domRenderer.js", () => ({ domRenderer: vi.fn(), clearRendererTarget: vi.fn() }));

describe("useGraphPatchSubscriber", () => {
  it("subscribes to values without composing in React", () => {
    const unsubscribe = vi.fn(); const subscribe = vi.fn(() => unsubscribe); const runtime = { subscribe };
    const ref = { current: {} }; const compose = vi.fn();
    const { unmount } = renderHook(() => useGraphPatchSubscriber(runtime, "n0", ref));
    const callback = subscribe.mock.calls[0][1]; callback({ values: { opacity: 0.5 }, revision: 1 });
    expect(compose).not.toHaveBeenCalled(); expect(unsubscribe).not.toHaveBeenCalled(); unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
