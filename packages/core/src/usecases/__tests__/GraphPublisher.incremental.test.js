import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import { buildRealGraph, chainMotion, diamondMotion } from "../../__fixtures__/graphTracks.js";

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
});
