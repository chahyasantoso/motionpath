/**
 * PR-02, lifecycle ownership repair.
 *
 * destroy() used to be a partial clear: hooks came off, but the publisher kept
 * every Track, edge and order entry, a second call re-ran the whole teardown,
 * and a stale flush could still compose against a dead graph. These tests pin
 * the contract instead of the implementation detail.
 */
import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

function publisherFor(motion) {
  const { graph, tracks } = buildRealGraph(motion);
  const published = [];
  const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
  return { graph, tracks, publisher, published };
}

describe("GraphPublisher disposal", () => {
  it("releases the graph it was holding", () => {
    const { publisher } = publisherFor(chainMotion(3));
    publisher.markAllDirty();
    publisher.flush();

    publisher.destroy();

    expect(publisher.isDestroyed).toBe(true);
    expect(publisher.trackCount).toBe(0);
    expect(publisher.graphOrder).toEqual([]);
  });

  it("does not clear the track registry it was handed", () => {
    const { publisher, tracks } = publisherFor(chainMotion(2));

    publisher.destroy();

    expect(tracks.size).toBe(2);
    expect(tracks.get("n0").isDestroyed).toBe(false);
  });

  it("is idempotent", () => {
    const { publisher } = publisherFor(chainMotion(2));
    publisher.destroy();

    expect(() => publisher.destroy()).not.toThrow();
    expect(publisher.flush()).toBe(0);
  });

  it("publishes nothing once disposed, however hard it is poked", () => {
    const { publisher, tracks, published } = publisherFor(chainMotion(2));
    publisher.markAllDirty();
    publisher.flush();
    published.length = 0;

    publisher.destroy();
    tracks.get("n0").progress(0.5);
    publisher.markDirty("n0");
    publisher.markAllDirty();
    publisher.resetRetry("n0");

    expect(publisher.flush()).toBe(0);
    expect(published).toEqual([]);
  });

  it("rejects graph mutation once disposed", () => {
    const { publisher, graph, tracks } = publisherFor(chainMotion(2));
    publisher.destroy();

    expect(() => publisher.applyGraph(graph, tracks)).toThrow(/destroyed/i);
    expect(() => publisher.addEdge({ source: "n0", target: "n1" })).toThrow(/destroyed/i);
    expect(() => publisher.removeEdge({ source: "n0", target: "n1" })).toThrow(/destroyed/i);
    // removeTrack stays a no-op: it is the destroy path a Track lifecycle event
    // lands on, and a late event must not blow up teardown.
    expect(() => publisher.removeTrack("n0")).not.toThrow();
  });

  it("installs the live cycle guard and takes it back off on disposal", () => {
    const { publisher, tracks } = publisherFor(chainMotion(2));
    const n0 = tracks.get("n0");
    const n1 = tracks.get("n1");

    expect(() => n0.setObserved(n1, (patch) => patch, { role: "output" })).toThrow(/cycle/i);

    publisher.destroy();

    expect(() => n0.setObserved(n1, (patch) => patch, { role: "output" })).not.toThrow();
  });

  it("survives repeated destroy of its tracks after disposal", () => {
    const { publisher, tracks } = publisherFor(chainMotion(3));
    publisher.destroy();

    for (const track of tracks.values()) {
      expect(() => track.destroy()).not.toThrow();
      expect(() => track.destroy()).not.toThrow();
    }
    expect(publisher.flush()).toBe(0);
  });
});
