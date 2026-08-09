/**
 * PR-03, graph transaction correctness.
 *
 * The publisher used to share its caller's track registry, check graph
 * membership in one direction only, and register a track before validating the
 * graph it belonged to. Each of those let the IR and the publish schedule
 * disagree while both looked healthy.
 */
import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import {
  buildRealGraph,
  chainMotion,
  diamondMotion,
  makeTrack,
} from "../../__fixtures__/graphTracks.js";

describe("GraphPublisher — defensive track registry", () => {
  it("does not follow the caller's map after construction", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const published = [];
    const publisher = new GraphPublisher({
      graph,
      tracks,
      publish: (id) => published.push(id),
    });

    tracks.delete("n1");

    expect(publisher.trackCount).toBe(3);
    publisher.markAllDirty();
    publisher.flush();
    expect(published).toEqual(["n0", "n1", "n2"]);
  });

  it("does not write into the caller's map when its own topology changes", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });

    publisher.addTrack("late", makeTrack("late"));
    publisher.removeTrack("n0");

    expect([...tracks.keys()]).toEqual(["n0", "n1", "n2"]);
    expect(publisher.trackCount).toBe(3);
    expect(publisher.graphOrder).toContain("late");
    expect(publisher.graphOrder).not.toContain("n0");
  });

  it("copies an entries iterable just as defensively", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));
    const entries = [...tracks];
    const publisher = new GraphPublisher({
      graph,
      tracks: entries,
      publish: () => {},
    });

    expect(publisher.trackCount).toBe(2);
    expect(publisher.graphOrder).toEqual(["n0", "n1"]);
  });
});

describe("GraphPublisher — membership in both directions", () => {
  it("rejects a graph node with no registered track", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    tracks.delete("n2");

    expect(
      () => new GraphPublisher({ graph, tracks, publish: () => {} }),
    ).toThrow(/node 'n2' has no registered track/i);
  });

  it("rejects a registered track the graph does not declare", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    tracks.set("ghost", makeTrack("ghost"));

    expect(
      () => new GraphPublisher({ graph, tracks, publish: () => {} }),
    ).toThrow(/track 'ghost' is missing from the graph/i);
  });

  it("rejects an applyGraph whose tracks and nodes disagree, and stays usable", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const published = [];
    const publisher = new GraphPublisher({
      graph,
      tracks,
      publish: (id) => published.push(id),
    });
    const orderBefore = publisher.graphOrder;

    const rebuilt = buildRealGraph(diamondMotion());
    rebuilt.tracks.delete("d");

    expect(() => publisher.applyGraph(rebuilt.graph, rebuilt.tracks)).toThrow(
      /has no registered track/i,
    );
    expect(publisher.graphOrder).toEqual(orderBefore);
    expect(publisher.trackCount).toBe(3);

    publisher.markAllDirty();
    publisher.flush();
    expect(published).toEqual(["n0", "n1", "n2"]);
  });
});

describe("GraphPublisher — atomic mutation", () => {
  it("registers nothing when addTrack names an unknown source", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });
    const orderBefore = publisher.graphOrder;

    expect(() =>
      publisher.addTrack("late", makeTrack("late"), {
        observes: [{ source: "ghost" }],
      }),
    ).toThrow(/unknown track/i);

    expect(publisher.trackCount).toBe(3);
    expect(publisher.graphOrder).toEqual(orderBefore);
    // The proof that nothing was half-registered: the same id still registers
    // cleanly. The old version threw "duplicate track id" here.
    expect(() => publisher.addTrack("late", makeTrack("late"))).not.toThrow();
    expect(publisher.trackCount).toBe(4);
  });

  it("leaves the schedule alone when an edge would close a cycle", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    const published = [];
    const publisher = new GraphPublisher({
      graph,
      tracks,
      publish: (id) => published.push(id),
    });
    publisher.markAllDirty();
    publisher.flush();
    published.length = 0;
    const orderBefore = publisher.graphOrder;

    expect(() =>
      publisher.addEdge({ source: "n2", target: "n0", role: "output" }),
    ).toThrow(/cycle/i);

    expect(publisher.graphOrder).toEqual(orderBefore);
    expect(publisher.flush()).toBe(0);
    expect(published).toEqual([]);
  });

  it("keeps the order and the edge set consistent after a removal", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(4));
    const published = [];
    const publisher = new GraphPublisher({
      graph,
      tracks,
      publish: (id) => published.push(id),
    });

    publisher.removeTrack("n2");

    expect(publisher.graphOrder).toEqual(["n0", "n1", "n3"]);
    publisher.markDirty("n0");
    publisher.flush();
    expect(published).toEqual(["n0", "n1"]);
  });
});

describe("GraphPublisher — retry configuration", () => {
  it("rejects the retry option that was accepted and then ignored", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));

    expect(
      () =>
        new GraphPublisher({
          graph,
          tracks,
          publish: () => {},
          retry: { onExhausted: "drop" },
        }),
    ).toThrow(/unknown retry option 'onExhausted'/i);
  });

  it("still accepts the options it actually honors", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));

    expect(
      () =>
        new GraphPublisher({
          graph,
          tracks,
          publish: () => {},
          retry: { maxAttempts: 2, backoff: 1 },
        }),
    ).not.toThrow();
  });

  it("rejects a typo instead of silently defaulting", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(2));

    expect(
      () =>
        new GraphPublisher({
          graph,
          tracks,
          publish: () => {},
          retry: { maxAttempt: 2 },
        }),
    ).toThrow(/unknown retry option/i);
  });
});
