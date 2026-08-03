import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import {
  buildRealGraph,
  chainMotion,
  diamondMotion,
  independentChainsMotion,
} from "../../__fixtures__/graphTracks.js";

describe("GraphPublisher incremental cache", () => {
  it("does not recompose idle nodes after the cache is warm", () => {
    const { graph, tracks, composeCounts } = buildRealGraph(chainMotion(6));
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });

    publisher.markAllDirty();
    publisher.flush();
    const warmed = new Map(composeCounts);

    publisher.markDirty("n5");
    publisher.flush();

    expect(composeCounts.get("n0")).toBe(warmed.get("n0"));
    expect(composeCounts.get("n4")).toBe(warmed.get("n4"));
    expect(composeCounts.get("n5")).toBe(warmed.get("n5") + 1);
  });

  it("invalidates a downstream closure, not unrelated branches", () => {
    const { graph, tracks, composeCounts } = buildRealGraph(diamondMotion());
    const publisher = new GraphPublisher({ graph, tracks, publish: () => {} });

    publisher.markAllDirty();
    publisher.flush();
    const warmed = new Map(composeCounts);

    publisher.markDirty("a");
    publisher.flush();

    expect(composeCounts.get("a")).toBe(warmed.get("a") + 1);
    expect(composeCounts.get("b")).toBe(warmed.get("b") + 1);
    expect(composeCounts.get("c")).toBe(warmed.get("c") + 1);
    expect(composeCounts.get("d")).toBe(warmed.get("d") + 1);
  });

  it("does not lose a failed publisher node", () => {
    const { graph, tracks } = buildRealGraph(chainMotion(3));
    let fail = true;
    const published = [];
    const publisher = new GraphPublisher({
      graph,
      tracks,
      publish: (id) => {
        if (id === "n1" && fail) { fail = false; throw new Error("temporary renderer failure"); }
        published.push(id);
      },
    });

    publisher.markAllDirty();
    expect(() => publisher.flush()).toThrow(AggregateError);
    expect(published).toContain("n0");
    expect(published).toContain("n2");
    published.length = 0;
    publisher.flush();
    expect(published).toEqual(["n1"]);
  });

  it("blocks the downstream closure until a compose failure clears", () => {
    let failCompose = true;
    const { graph, tracks } = buildRealGraph(chainMotion(3), {
      onCompose: (id) => {
        if (id === "n1" && failCompose) throw new Error("temporary compose failure");
      },
    });
    const published = [];
    const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });

    publisher.markAllDirty();
    expect(() => publisher.flush()).toThrow(AggregateError);
    // n1 produced no patch at all, so n2 must not publish against a stale source.
    expect(published).toEqual(["n0"]);

    failCompose = false;
    published.length = 0;
    publisher.flush();
    // A compose failure stays a state change: source and dependents both republish.
    expect(published).toEqual(["n1", "n2"]);

    published.length = 0;
    publisher.flush();
    expect(published).toEqual([]);
  });

  it("keeps an independent branch publishing when another branch fails to publish", () => {
    const { graph, tracks, composeCounts } = buildRealGraph(independentChainsMotion());
    let fail = true;
    const published = [];
    const publisher = new GraphPublisher({
      graph,
      tracks,
      publish: (id) => {
        if (id === "a0" && fail) { fail = false; throw new Error("temporary renderer failure"); }
        published.push(id);
      },
    });

    publisher.markAllDirty();
    expect(() => publisher.flush()).toThrow(AggregateError);
    // a0's patch is valid, so its dependent still publishes; b is untouched.
    expect(published).toEqual(["a1", "b0", "b1"]);
    const warmed = new Map(composeCounts);

    published.length = 0;
    publisher.flush();
    // The retry recomposes and republishes only the failed node.
    expect(published).toEqual(["a0"]);
    expect(composeCounts.get("a0")).toBe(warmed.get("a0") + 1);
    expect(composeCounts.get("a1")).toBe(warmed.get("a1"));
    expect(composeCounts.get("b0")).toBe(warmed.get("b0"));
    expect(composeCounts.get("b1")).toBe(warmed.get("b1"));
  });
});
