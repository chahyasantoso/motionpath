import { describe, it, expect, vi } from "vitest";
import { Overlay } from "../Overlay.js";

function track() {
  return {
    setObserved: vi.fn(),
    removeObserved: vi.fn(),
    destroy: vi.fn(),
    progress: 0,
  };
}

describe("Overlay", () => {
  it("attaches and hard-replaces the previous observation", () => {
    const source = track();
    const first = track();
    const second = track();
    const overlay = new Overlay();
    overlay.attach(source, first, (patch) => patch);
    overlay.replace(source, second, (patch) => patch);
    expect(source.removeObserved).toHaveBeenCalledWith(first);
    expect(source.setObserved).toHaveBeenCalledWith(
      second,
      expect.any(Function),
    );
  });

  it("rejects play after detach and destroys the overlay exactly once", () => {
    const source = track();
    const child = track();
    const overlay = new Overlay().attach(source, child);
    overlay.detach();
    expect(overlay.play()).rejects.toThrow(/no attached/);
    overlay.attach(source, child);
    overlay.destroy();
    overlay.destroy();
    expect(source.removeObserved).toHaveBeenCalledWith(child);
    expect(child.destroy).toHaveBeenCalledTimes(1);
  });
});
