/**
 * Seeded differential fuzzing for the graph publisher.
 *
 * The forward-pass invalidation in docs/V4.3-GRAPH-CORRECTNESS-PLAN.md is the
 * one part of this work that cannot be proven by hand-written cases, so it is
 * compared against a deliberately naive oracle over hundreds of random DAGs.
 *
 * Every assertion carries its seed. A failure is reproducible by pinning the
 * seed in the loop; do not "fix" a failure by loosening the oracle.
 *
 * Two shapes of test live here:
 *
 * - COLD: a fresh publisher, one flush. Proves scheduling and dependent
 *   publishing.
 * - WARM: a warmed cache, then incremental flushes. Proves the persistent
 *   cache never serves a stale patch and never recomposes an idle node.
 *   Cold-only fuzzing is how the original publish-retry bug survived: every
 *   case built a new publisher, so cross-flush state was never exercised.
 */
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

/** Mutation seeds run 4+ full resyncs each, so they get a smaller budget. */
const MUTATION_ITERATIONS = 300;

const SLOW = 60_000;

/** Numeric rank of a `randomDagMotion` id. Every edge must run low -> high. */
const rankOf = (id) => Number(id.slice(1));

/**
 * The full-recomposition oracle. Whatever the cache did, the most recent patch
 * published for every live node must equal composing that node from scratch.
 *
 * Call this AFTER any compose-count assertions: it composes every track, which
 * moves the counters.
 */
function expectPatchesMatchFullRecompose(latest, tracks, label) {
  for (const [id, track] of tracks) {
    if (track.isDestroyed) continue;
    expect(latest.has(id), `${label}: ${id} never published a patch`).toBe(true);
    expect(latest.get(id), `${label}: stale cached patch for ${id}`).toEqual(
      track.compose(),
    );
  }
}

/**
 * The four representations from the audit must agree: live Track edges, the
 * normalized IR, and the publisher's node set and topological order.
 */
function expectRepresentationsAgree(binding, publisher, label) {
  const edgeKey = (source, target, role) => `${source}->${target}:${role}`;

  const live = [];
  for (const [id, track] of binding.tracks) {
    if (track.isDestroyed) continue;
    for (const edge of track.observedEdges) {
      live.push(edgeKey(edge.source.id, id, edge.role));
    }
  }
  const declared = binding.graph.edges.map((edge) =>
    edgeKey(edge.source, edge.target, edge.role),
  );
  expect(
    live.sort(),
    `${label}: live Track wiring drifted from the graph IR`,
  ).toEqual(declared.sort());

  const order = publisher.graphOrder;
  expect(
    new Set(order),
    `${label}: publisher node set drifted from the binding`,
  ).toEqual(new Set(binding.tracks.keys()));

  const rank = new Map(order.map((id, index) => [id, index]));
  for (const edge of binding.graph.edges) {
    expect(
      rank.get(edge.source) < rank.get(edge.target),
      `${label}: order violates ${edge.source} -> ${edge.target}`,
    ).toBe(true);
  }
}

describe("GraphPublisher — invalidation fuzz (cold)", () => {
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
  }, SLOW);

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
  }, SLOW);

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
  }, SLOW);
});

describe("GraphPublisher — persistent cache fuzz (warm)", () => {
  it("serves no stale patch and recomposes no idle node across repeated flushes", () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 40_000);
      const nodeCount = 3 + Math.floor(rand() * 8);
      const motion = randomDagMotion(nodeCount, 0.3, rand);
      const { graph, tracks, composeCounts } = buildRealGraph(motion);
      const ids = motion.tracks.map((t) => t.id);

      const published = [];
      const latest = new Map();
      const publisher = new GraphPublisher({
        graph,
        tracks,
        publish: (id, patch) => {
          published.push(id);
          latest.set(id, patch);
        },
      });

      // Warm every entry so the rest of the run exercises cache reuse only.
      publisher.markAllDirty();
      publisher.flush();
      expect(
        new Set(published),
        `seed ${seed}: warm-up did not publish every node`,
      ).toEqual(new Set(ids));

      for (let round = 1; round <= 3; round += 1) {
        const label = `seed ${seed} round ${round}`;
        const before = new Map(composeCounts);

        const touched = ids.filter(() => rand() < 0.3);
        if (touched.length === 0) touched.push(ids[Math.floor(rand() * ids.length)]);
        // progress() invalidates through the lifecycle hook, which is the real
        // production path into markDirty. No manual marking here on purpose.
        for (const id of touched) tracks.get(id).progress(rand());

        published.length = 0;
        publisher.flush();

        const closure = downstreamClosure(motion, touched);
        expect(new Set(published), `${label}: publish set mismatch`).toEqual(
          closure,
        );

        const after = new Map(composeCounts);
        for (const id of ids) {
          const expected = before.get(id) + (closure.has(id) ? 1 : 0);
          expect(
            after.get(id),
            closure.has(id)
              ? `${label}: ${id} should recompose exactly once`
              : `${label}: idle ${id} was recomposed`,
          ).toBe(expected);
        }

        // Composes every track, so it must come after the count assertions.
        expectPatchesMatchFullRecompose(latest, tracks, label);
      }

      expect(publisher.flush(), `seed ${seed}: idle flush was not a no-op`).toBe(
        0,
      );
    }
  }, SLOW);
});

describe("GraphPublisher — topology mutation fuzz", () => {
  it("keeps every representation and every patch in agreement across random mutations", () => {
    for (let seed = 1; seed <= MUTATION_ITERATIONS; seed += 1) {
      const rand = seededRandom(seed + 50_000);
      const nodeCount = 4 + Math.floor(rand() * 5);
      const motion = randomDagMotion(nodeCount, 0.3, rand);
      const { graph, tracks } = buildRealGraph(motion);

      const latest = new Map();
      const publisher = new GraphPublisher({
        graph,
        tracks,
        publish: (id, patch) => latest.set(id, patch),
      });
      // Constructing the binding resyncs the publisher and marks everything
      // dirty, so one flush leaves a fully warm cache.
      const binding = new GraphBinding({ graph, tracks, publisher });
      publisher.flush();
      expectRepresentationsAgree(binding, publisher, `seed ${seed} initial`);
      expectPatchesMatchFullRecompose(
        latest,
        binding.tracks,
        `seed ${seed} initial`,
      );

      for (let step = 1; step <= 3; step += 1) {
        const label = `seed ${seed} step ${step}`;
        const live = [...binding.tracks.keys()];
        const edges = binding.graph.edges;
        const existing = new Set(
          edges.map((edge) => `${edge.source}->${edge.target}`),
        );

        // Only ever add low-rank -> high-rank, which keeps the DAG acyclic by
        // construction instead of relying on the validator to catch us.
        const additions = [];
        for (const source of live) {
          for (const target of live) {
            if (rankOf(source) >= rankOf(target)) continue;
            if (existing.has(`${source}->${target}`)) continue;
            additions.push({ source, target });
          }
        }

        const roll = rand();
        if (roll < 0.45 && additions.length) {
          const edge = additions[Math.floor(rand() * additions.length)];
          binding.addEdge({
            ...edge,
            role: "output",
            mapFn: (patch) => ({ [`from_${edge.source}`]: patch.transform }),
          });
        } else if (roll < 0.8 && edges.length) {
          const edge = edges[Math.floor(rand() * edges.length)];
          binding.removeEdge({
            source: edge.source,
            target: edge.target,
            role: edge.role,
          });
        } else if (live.length > 2) {
          const doomed = live[Math.floor(rand() * live.length)];
          binding.removeTrack(doomed);
          latest.delete(doomed);
        }

        publisher.flush();
        expectRepresentationsAgree(binding, publisher, label);
        expectPatchesMatchFullRecompose(latest, binding.tracks, label);
      }

      // A rejected mutation must be a true no-op: no half-applied Track edge,
      // no spuriously dirtied node. Reversing a live edge is always a cycle.
      const reversible = binding.graph.edges[0];
      if (reversible) {
        const label = `seed ${seed} rejected`;
        expect(() =>
          binding.addEdge({
            source: reversible.target,
            target: reversible.source,
            role: "output",
          }),
        ).toThrow(/cycle/i);
        expectRepresentationsAgree(binding, publisher, label);
        expect(
          publisher.flush(),
          `${label}: rejected mutation dirtied the graph`,
        ).toBe(0);
      }

      binding.destroy();
    }
  }, SLOW);
});
