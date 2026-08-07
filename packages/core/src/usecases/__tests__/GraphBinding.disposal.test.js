/**
 * PR-02, lifecycle ownership repair.
 *
 * Disposal used to stop at the binding: GraphBinding.destroy() unsubscribed
 * itself and left the publisher fully wired, holding every track and every
 * cycle guard. These tests pin the chain GraphBinding -> GraphPublisher.
 * The publisher's own disposal contract lives in GraphPublisher.disposal.test.js.
 */
import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

function bind(motion, options = {}) {
  const { graph, tracks, composeCounts } = buildRealGraph(motion);
  const published = [];
  const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
  const binding = new GraphBinding({ graph, tracks, publisher, ...options });
  return { graph, tracks, publisher, binding, published, composeCounts };
}

describe("GraphBinding — disposal ownership", () => {
  it("disposes the publisher it owns", () => {
    const { binding, publisher } = bind(chainMotion(3));
    expect(publisher.isDestroyed).toBe(false);

    binding.destroy();

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
    expect(publisher.trackCount).toBe(0);
    expect(publisher.graphOrder).toEqual([]);
  });

  it("releases its own track references", () => {
    const { binding } = bind(chainMotion(3));
    expect(binding.tracks.size).toBe(3);
    binding.destroy();
    expect(binding.tracks.size).toBe(0);
  });

  it("leaves a publisher it does not own alone", () => {
    const { binding, publisher, published } = bind(chainMotion(2), { ownsPublisher: false });
    binding.destroy();

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(false);
    expect(publisher.trackCount).toBe(2);

    published.length = 0;
    publisher.markAllDirty();
    publisher.flush();
    expect(published).toEqual(["n0", "n1"]);
  });

  it("is idempotent across repeated destroy calls", () => {
    const { binding, publisher } = bind(chainMotion(2));
    expect(() => { binding.destroy(); binding.destroy(); binding.destroy(); }).not.toThrow();
    expect(() => { publisher.destroy(); publisher.destroy(); }).not.toThrow();
    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
  });

  it("stops composing once the whole chain is disposed", () => {
    const { binding, publisher, published, composeCounts } = bind(chainMotion(3));
    publisher.markAllDirty();
    publisher.flush();
    const warmed = new Map(composeCounts);
    published.length = 0;

    binding.destroy();
    publisher.markAllDirty();

    expect(publisher.flush()).toBe(0);
    expect(published).toEqual([]);
    for (const [id, count] of warmed) expect(composeCounts.get(id)).toBe(count);
  });

  it("keeps the cycle guard installed after an unrelated mutation", () => {
    const { binding, tracks } = bind(chainMotion(3));
    binding.removeEdge({ source: "n1", target: "n2", role: "output" });
    expect(() => tracks.get("n0").setObserved(tracks.get("n1"), (patch) => patch, { role: "output" })).toThrow(/cycle/i);
  });

  it("can dispose a publisher whose binding rejected the graph", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    tracks.get("n0").setObserved(tracks.get("n2"), () => ({}), { role: "output" });
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });

    expect(() => new GraphBinding({ graph, tracks, publisher })).toThrow();

    publisher.destroy();
    expect(publisher.isDestroyed).toBe(true);
    expect(publisher.trackCount).toBe(0);
    expect(publisher.flush()).toBe(0);
  });
});
