import { describe, expect, it } from "vitest";
import { GraphPublisher } from "../GraphPublisher.js";
import { GraphBinding } from "../GraphBinding.js";
import {
  buildRealGraph,
  downstreamClosure,
  randomDagMotion,
  seededRandom,
} from "../../__fixtures__/graphTracks.js";

const ITERATIONS = 500;

function edgeKey(source, target, role, input) {
  return `${source}|${role ?? "output"}|${input ?? ""}->${target}`;
}

function liveEdgeKeys(tracks) {
  const keys = [];
  for (const [id, track] of tracks) {
    if (track.isDestroyed) continue;
    for (const edge of track.observedEdges ?? []) keys.push(edgeKey(edge.source.id, id, edge.role, edge.input));
  }
  return keys.sort();
}

function declaredEdgeKeys(graph) {
  return graph.edges.map((edge) => edgeKey(edge.source, edge.target, edge.role, edge.input)).sort();
}

function expectTopological(order, graph, label) {
  const rank = new Map(order.map((id, index) => [id, index]));
  for (const edge of graph.edges) {
    // Narrow cache commits intentionally publish only the changed closure.
    // Edges with a cached endpoint are not order constraints for this pass.
    if (!rank.has(edge.source) || !rank.has(edge.target)) continue;
    expect(
      rank.get(edge.source) < rank.get(edge.target),
      `${label}: ${edge.source} is not ordered before ${edge.target}`,
    ).toBe(true);
  }
}

function graphMotion(graph) {
  return {
    tracks: graph.nodes.map(({ id }) => ({
      id,
      observes: graph.edges
        .filter((edge) => edge.target === id)
        .map(({ source, role, input }) => ({
          source,
          role,
          ...(role === "input" ? { target: input } : {}),
        })),
    })),
  };
}

describe("GraphPublisher — invalidation fuzz", () => {
  it("publish set always equals the transitive downstream closure of the marks", () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed);
      const nodeCount = 3 + Math.floor(rand() * 12);
      const motion = randomDagMotion(nodeCount, 0.3, rand);
      const { graph, tracks } = buildRealGraph(motion);
      const published = [];
      const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
      const marked = motion.tracks.map((t) => t.id).filter(() => rand() < 0.25);
      if (marked.length === 0) marked.push(motion.tracks[0].id);
      for (const id of marked) publisher.markDirty(id);
      publisher.flush();
      expect(new Set(published), `seed ${seed}: publish set mismatch`).toEqual(downstreamClosure(motion, marked));
    }
  });

  it("always publishes in an order consistent with the compiled topology", () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 10_000);
      const nodeCount = 3 + Math.floor(rand() * 12);
      const motion = randomDagMotion(nodeCount, 0.35, rand);
      const { graph, tracks } = buildRealGraph(motion);
      const published = [];
      const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
      publisher.markDirty(motion.tracks[0].id);
      publisher.flush();
      const rank = new Map(graph.order.map((id, index) => [id, index]));
      for (let i = 1; i < published.length; i += 1) {
        expect(rank.get(published[i - 1]) < rank.get(published[i]), `seed ${seed}: ${published[i - 1]} published after ${published[i]}`).toBe(true);
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
      const publisher = new GraphPublisher({ graph, tracks, publish: (id, patch) => patches.set(id, patch) });
      for (const config of motion.tracks) tracks.get(config.id).progress(rand());
      publisher.markDirty(motion.tracks[0].id);
      publisher.flush();
      for (const [id, patch] of patches) expect(patch, `seed ${seed}: stale patch for ${id}`).toEqual(tracks.get(id).compose());
    }
  });
});

describe("GraphPublisher — cross-flush cache fuzz", () => {
  it("never serves a stale patch after repeated state changes", () => {
    const ROUNDS = 4;
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 30_000);
      const nodeCount = 3 + Math.floor(rand() * 7);
      const motion = randomDagMotion(nodeCount, 0.35, rand);
      const { graph, tracks } = buildRealGraph(motion);
      const ids = motion.tracks.map((t) => t.id);
      const lastPublished = new Map();
      const publisher = new GraphPublisher({ graph, tracks, publish: (id, patch) => lastPublished.set(id, patch) });
      publisher.markAllDirty();
      publisher.flush();
      for (let round = 0; round < ROUNDS; round += 1) {
        const touched = ids.filter(() => rand() < 0.3);
        if (touched.length === 0) touched.push(ids[Math.floor(rand() * ids.length)]);
        for (const id of touched) tracks.get(id).progress(rand());
        publisher.flush();
        for (const id of ids) expect(lastPublished.get(id), `seed ${seed} round ${round}: stale published patch for ${id} after touching [${touched.join(", ")}]`).toEqual(tracks.get(id).compose());
      }
    }
  });

  it("an idle flush after a settled graph publishes nothing", () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 40_000);
      const nodeCount = 3 + Math.floor(rand() * 7);
      const motion = randomDagMotion(nodeCount, 0.3, rand);
      const { graph, tracks } = buildRealGraph(motion);
      let publishes = 0;
      const publisher = new GraphPublisher({ graph, tracks, publish: () => { publishes += 1; } });
      publisher.markAllDirty();
      publisher.flush();
      publishes = 0;
      expect(publisher.flush(), `seed ${seed}: idle flush did work`).toBe(0);
      expect(publishes, `seed ${seed}: idle flush published`).toBe(0);
    }
  });
});

describe("GraphBinding — mutation agreement fuzz", () => {
  it("keeps live edges, the IR and publisher order in agreement through random mutations", () => {
    const MUTATIONS = 6;
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 50_000);
      const nodeCount = 3 + Math.floor(rand() * 7);
      const motion = randomDagMotion(nodeCount, 0.25, rand);
      const { graph, tracks } = buildRealGraph(motion);
      const ids = motion.tracks.map((t) => t.id);
      const published = [];
      const publisher = new GraphPublisher({ graph, tracks, publish: (id) => published.push(id) });
      const binding = new GraphBinding({ graph, tracks, publisher });

      for (let step = 0; step < MUTATIONS; step += 1) {
        const orderBefore = publisher.graphOrder;
        const declaredBefore = declaredEdgeKeys(binding.graph);
        const liveBefore = liveEdgeKeys(binding.tracks);
        const label = `seed ${seed} step ${step}`;
        expect(liveBefore, `${label}: live edges drifted from the IR`).toEqual(declaredBefore);
        const existing = binding.graph.edges;
        const removing = existing.length > 0 && rand() < 0.4;
        const mutationSeeds = new Set();

        try {
          if (removing) {
            const edge = existing[Math.floor(rand() * existing.length)];
            mutationSeeds.add(edge.target);
            binding.removeEdge({ source: edge.source, target: edge.target, role: edge.role });
          } else {
            const source = ids[Math.floor(rand() * ids.length)];
            const target = ids[Math.floor(rand() * ids.length)];
            mutationSeeds.add(target);
            binding.addEdge({ source, target, role: "output", mapFn: (patch) => ({ [`from_${source}`]: patch.transform }) });
          }
        } catch {
          expect(publisher.graphOrder, `${label}: order changed on a rejected mutation`).toEqual(orderBefore);
          expect(declaredEdgeKeys(binding.graph), `${label}: IR changed on a rejected mutation`).toEqual(declaredBefore);
          expect(liveEdgeKeys(binding.tracks), `${label}: Track wiring changed on a rejected mutation`).toEqual(liveBefore);
          continue;
        }

        expect(liveEdgeKeys(binding.tracks), `${label}: live edges drifted after commit`).toEqual(declaredEdgeKeys(binding.graph));
        expectTopological(publisher.graphOrder, binding.graph, label);
        published.length = 0;
        publisher.flush();
        const expected = downstreamClosure(graphMotion(binding.graph), [...mutationSeeds]);
        expect(new Set(published), `${label}: mutation invalidated the wrong closure`).toEqual(expected);
        expectTopological(published, binding.graph, `${label}: publish order`);
      }
      binding.destroy();
    }
  });
});
