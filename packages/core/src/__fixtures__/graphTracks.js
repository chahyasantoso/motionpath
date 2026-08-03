/**
 * Shared fixtures for graph-layer tests.
 *
 * Every helper here returns REAL `Track` instances. Graph tests must never
 * substitute object literals for tracks: the original GraphPublisher unit
 * tests did exactly that, and as a result the publisher shipped marked
 * "Complete" while being unable to publish a node's dependents at all.
 * See docs/V4.3-GRAPH-CORRECTNESS-PLAN.md.
 */
import { gsap } from "gsap";
import { Track } from "../lib/Track.js";
import { normalizeObservationGraph } from "../usecases/normalizeObservationGraph.js";

/**
 * A real Track with a single two-key plugin, matching the shape used by the
 * existing Track.test.js fixtures so behavior stays comparable.
 *
 * @param {string} id
 * @param {{ onCompose?: (id: string) => void }} [options]
 */
export function makeTrack(id, options = {}) {
  const proxy = { x: 0, y: 0 };
  const tween = gsap.to(proxy, {
    x: 100,
    y: 200,
    duration: 1,
    ease: "none",
    paused: true,
  });
  const plugins = [
    {
      keys: ["x", "y"],
      compose: (raw) => {
        options.onCompose?.(id);
        return {
          transform: `translate3d(${raw.x ?? 0}px, ${raw.y ?? 0}px, 0px)`,
        };
      },
    },
  ];
  return new Track({
    id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins,
    resolvedTrack: { id, keyframes: { x: {}, y: {} } },
  });
}

/**
 * Normalize a declarative motion into the real graph IR, build a real Track
 * per node, and wire the observation edges with setObserved.
 *
 * Returns the IR, the id -> Track map the publisher expects, and a live
 * per-track plugin-invocation counter so tests can assert compose counts
 * rather than spying on compose() itself.
 */
export function buildRealGraph(motion) {
  const graph = normalizeObservationGraph(motion);
  const composeCounts = new Map();
  const bump = (id) => composeCounts.set(id, (composeCounts.get(id) ?? 0) + 1);

  const tracks = new Map();
  for (const config of motion.tracks) {
    tracks.set(config.id, makeTrack(config.id, { onCompose: bump }));
  }

  for (const config of motion.tracks) {
    for (const edge of config.observes ?? []) {
      const observer = tracks.get(config.id);
      const source = tracks.get(edge.source);
      observer.setObserved(
        source,
        (patch) => ({ [`from_${edge.source}`]: patch.transform }),
        { role: edge.role ?? "output" },
      );
    }
  }

  return { graph, tracks, composeCounts };
}

/** a -> {b, c} -> d. The classic shared-ancestor diamond. */
export function diamondMotion() {
  return {
    tracks: [
      { id: "a" },
      { id: "b", observes: [{ source: "a" }] },
      { id: "c", observes: [{ source: "a" }] },
      { id: "d", observes: [{ source: "b" }, { source: "c" }] },
    ],
  };
}

/** n0 -> n1 -> ... -> n(count-1). Straight FK-style chain. */
export function chainMotion(count) {
  return {
    tracks: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      ...(i === 0 ? {} : { observes: [{ source: `n${i - 1}` }] }),
    })),
  };
}

/** Deterministic PRNG so fuzz failures are reproducible from the seed alone. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Random DAG. Edges only ever point from a lower index to a higher one, which
 * makes acyclicity structural rather than something the generator has to check.
 */
export function randomDagMotion(nodeCount, edgeChance, rand) {
  const tracks = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const observes = [];
    for (let j = 0; j < i; j += 1) {
      if (rand() < edgeChance) observes.push({ source: `n${j}` });
    }
    tracks.push({ id: `n${i}`, ...(observes.length ? { observes } : {}) });
  }
  return { tracks };
}

/**
 * Reference implementation of the publish set: the transitive downstream
 * closure of the marked nodes. Deliberately naive; the publisher is the thing
 * under test, so the oracle must not share its logic.
 */
export function downstreamClosure(motion, marked) {
  const dependents = new Map(motion.tracks.map((t) => [t.id, []]));
  for (const track of motion.tracks) {
    for (const edge of track.observes ?? []) {
      dependents.get(edge.source).push(track.id);
    }
  }
  const out = new Set();
  const queue = [...marked];
  while (queue.length) {
    const id = queue.shift();
    if (out.has(id)) continue;
    out.add(id);
    for (const next of dependents.get(id) ?? []) queue.push(next);
  }
  return out;
}
