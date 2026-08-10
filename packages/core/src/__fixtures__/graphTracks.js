/** Shared fixtures for graph-layer tests using real Track instances. */
import { gsap } from "gsap";
import { Track } from "../lib/Track.js";
import { StandaloneObservationAdapter } from "../usecases/StandaloneObservationAdapter.js";
import { normalizeObservationGraph } from "../usecases/normalizeObservationGraph.js";

export function makeTrack(id, options = {}) {
  const proxy = { x: 0, y: 0 };
  const tween = gsap.to(proxy, {
    x: 100,
    y: 200,
    duration: 1,
    ease: "none",
    paused: true,
  });
  const plugins = [{
    keys: ["x", "y"],
    compose: (raw) => {
      options.onCompose?.(id);
      return { transform: `translate3d(${raw.x ?? 0}px, ${raw.y ?? 0}px, 0px)` };
    },
  }];
  return new Track({
    id,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins,
    resolvedTrack: { id, keyframes: { x: {}, y: {} } },
    observationAdapter: options.observationAdapter,
  });
}

export function buildRealGraph(motion, options = {}) {
  const graph = normalizeObservationGraph(motion);
  const composeCounts = new Map();
  const adapter = new StandaloneObservationAdapter();
  const bump = (id) => {
    composeCounts.set(id, (composeCounts.get(id) ?? 0) + 1);
    options.onCompose?.(id);
  };
  const tracks = new Map();
  for (const config of motion.tracks)
    tracks.set(config.id, makeTrack(config.id, { onCompose: bump, observationAdapter: adapter }));
  for (const config of motion.tracks) {
    for (const edge of config.observes ?? []) {
      const observer = tracks.get(config.id);
      const source = tracks.get(edge.source);
      adapter.setObserved(
        observer,
        source,
        (patch) => ({ [`from_${edge.source}`]: patch.transform }),
        { role: edge.role ?? "output" },
      );
    }
  }
  return { graph, tracks, composeCounts, observationAdapter: adapter };
}

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

export function chainMotion(count) {
  return {
    tracks: Array.from({ length: count }, (_, i) => ({
      id: `n${i}`,
      ...(i === 0 ? {} : { observes: [{ source: `n${i - 1}` }] }),
    })),
  };
}

export function independentChainsMotion() {
  return {
    tracks: [
      { id: "a0" },
      { id: "a1", observes: [{ source: "a0" }] },
      { id: "b0" },
      { id: "b1", observes: [{ source: "b0" }] },
    ],
  };
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function randomDagMotion(nodeCount, edgeChance, rand) {
  const tracks = [];
  for (let i = 0; i < nodeCount; i += 1) {
    const observes = [];
    for (let j = 0; j < i; j += 1)
      if (rand() < edgeChance) observes.push({ source: `n${j}` });
    tracks.push({ id: `n${i}`, ...(observes.length ? { observes } : {}) });
  }
  return { tracks };
}

export function downstreamClosure(motion, marked) {
  const dependents = new Map(motion.tracks.map((t) => [t.id, []]));
  for (const track of motion.tracks)
    for (const edge of track.observes ?? []) dependents.get(edge.source).push(track.id);
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
