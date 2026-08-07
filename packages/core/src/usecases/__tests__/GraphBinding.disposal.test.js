/**
 * PR-02, lifecycle ownership repair.
 *
 * A GraphBinding owns the publisher it is constructed with, so tearing down the
 * binding must tear down the whole graph layer. Without that, disposal has two
 * entry points and the owner has to know the internals to get it right.
 */
import { describe, expect, it } from "vitest";
import { GraphBinding } from "../GraphBinding.js";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

function bind(motion, options = {}) {
  const { graph, tracks } = buildRealGraph(motion);
  const published = [];
  const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
  const binding = new GraphBinding({ graph, tracks, publisher, ...options });
  return { graph, tracks, publisher, binding, published };
}

describe("GraphBinding disposal", () => {
  it("disposes the publisher it owns", () => {
    const { binding, publisher } = bind(chainMotion(3));

    binding.destroy();

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(true);
    expect(publisher.trackCount).toBe(0);
    expect(binding.publisher).toBeNull();
  });

  it("leaves a borrowed publisher alone", () => {
    const { binding, publisher } = bind(chainMotion(3), { ownsPublisher: false });

    binding.destroy();

    expect(binding.isDestroyed).toBe(true);
    expect(publisher.isDestroyed).toBe(false);
    expect(publisher.trackCount).toBe(3);
  });

  it("is idempotent", () => {
    const { binding, publisher } = bind(chainMotion(3));
    binding.destroy();

    expect(() => binding.destroy()).not.toThrow();
    expect(publisher.isDestroyed).toBe(true);
  });

  it("releases its track references", () => {
    const { binding } = bind(chainMotion(3));

    binding.destroy();

    expect(binding.tracks.size).toBe(0);
  });

  it("stops reacting to track destruction", () => {
    const { binding, tracks } = bind(chainMotion(3));
    binding.destroy();

    expect(() => tracks.get("n1").destroy()).not.toThrow();
    expect(binding.graph.nodes.map((node) => node.id)).toContain("n1");
  });

  it("rejects mutation once disposed but keeps removal safe", () => {
    const { binding } = bind(chainMotion(3));
    binding.destroy();

    expect(() => binding.addEdge({ source: "n0", target: "n2" })).toThrow(/destroyed/i);
    expect(() => binding.removeTrack("n0")).not.toThrow();
  });

  it("survives a full destroy of every track after disposal", () => {
    const { binding, tracks } = bind(chainMotion(4));
    binding.destroy();

    for (const track of tracks.values()) {
      expect(() => track.destroy()).not.toThrow();
      expect(() => track.destroy()).not.toThrow();
    }
  });
});
