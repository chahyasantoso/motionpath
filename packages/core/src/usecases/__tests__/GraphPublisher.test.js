/**
 * Replaces the original fake-track suite.
 *
 * The old version handed GraphPublisher object literals implementing
 * `compose(_raw, composed)` with string-keyed reads, a contract no real Track
 * implements. That is why a publisher unable to publish a node's dependents
 * shipped marked "Complete". Every graph test now uses real Tracks.
 */
import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion } from "../../__fixtures__/graphTracks.js";

describe("GraphPublisher", () => {
  it("publishes dirty nodes once, in compiled order, with upstream context", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const calls = [];
    const publisher = new GraphPublisher({ graph, tracks, publish: (id, patch) => calls.push([id, patch]) });

    publisher.markDirty("n1");
    publisher.markDirty("n1");

    expect(publisher.flush()).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("n1");
    // n1 observes n0, so its patch carries the upstream contribution.
    expect(calls[0][1]).toHaveProperty("from_n0");
  });

  it("flushes all graph nodes in order and coalesces the next frame", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const calls = [];
    const publisher = new GraphPublisher({ graph, tracks, publish: (id) => calls.push(id) });

    publisher.markAllDirty();
    expect(publisher.flush()).toBe(2);
    expect(calls).toEqual(["n0", "n1"]);
    expect(publisher.flush()).toBe(0);
  });
});
