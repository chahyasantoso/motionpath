/**
 * PHASE 0 — RED BY DESIGN.
 *
 * The forward-pass invalidation in docs/V4.3-GRAPH-CORRECTNESS-PLAN.md §3.2 is
 * the one part of this work that cannot be proven by hand-written cases. This
 * compares the publisher against a deliberately naive oracle over hundreds of
 * random DAGs.
 *
 * Failures print their seed. Re-run a single seed to reproduce exactly.
 */
import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import {
  buildRealGraph,
  downstreamClosure,
  randomDagMotion,
  seededRandom,
} from "../../__fixtures__/graphTracks.js";

const ITERATIONS = 200;

describe("GraphPublisher — invalidation fuzz", () => {
  it("publish set always equals the transitive downstream closure of the marks", () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed);
      const nodeCount = 3 + Math.floor(rand() * 12);
      const motion = randomDagMotion(nodeCount, 0.3, rand);
      const { graph, tracks } = buildRealGraph(motion);

      const published = [];
      const publisher = new GraphPublisher({
        graph,
        tracks,
        publish: (id) => published.push(id),
      });

      const marked = motion.tracks
        .map((t) => t.id)
        .filter(() => rand() < 0.25);
      if (marked.length === 0) marked.push(motion.tracks[0].id);
      for (const id of marked) publisher.markDirty(id);
      publisher.flush();

      const expected = downstreamClosure(motion, marked);
      expect(
        new Set(published),
        `seed ${seed}: publish set mismatch`,
      ).toEqual(expected);
    }
  });

  it("always publishes in an order consistent with the compiled topology", () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 10_000);
      const nodeCount = 3 + Math.floor(rand() * 12);
      const motion = randomDagMotion(nodeCount, 0.35, rand);
      const { graph, tracks } = buildRealGraph(motion);

      const published = [];
      const publisher = new GraphPublisher({
        graph,
        tracks,
        publish: (id) => published.push(id),
      });

      publisher.markDirty(motion.tracks[0].id);
      publisher.flush();

      const rank = new Map(graph.order.map((id, index) => [id, index]));
      for (let i = 1; i < published.length; i += 1) {
        expect(
          rank.get(published[i - 1]) < rank.get(published[i]),
          `seed ${seed}: ${published[i - 1]} published after ${published[i]}`,
        ).toBe(true);
      }
    }
  });

  it("incremental patches match a from-scratch compose of every published node", () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 20_000);
      const nodeCount = 3 + Math.floor(rand() * 10);
      const motion = randomDagMotion(nodeCount, 0.3, rand);
      const { graph, tracks } = buildRealGraph(motion);

      const patches = new Map();
      const publisher = new GraphPublisher({
        graph,
        tracks,
        publish: (id, patch) => patches.set(id, patch),
      });

      for (const config of motion.tracks) {
        tracks.get(config.id).progress(rand());
      }
      publisher.markDirty(motion.tracks[0].id);
      publisher.flush();

      for (const [id, patch] of patches) {
        expect(patch, `seed ${seed}: stale patch for ${id}`).toEqual(
          tracks.get(id).compose(),
        );
      }
    }
  });
});
