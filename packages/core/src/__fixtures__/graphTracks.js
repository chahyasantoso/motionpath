import { gsap } from "gsap";
import { Track } from "../lib/Track.js";
import { normalizeObservationGraph } from "../usecases/normalizeObservationGraph.js";
import { installLegacyObservationFacade } from "../usecases/LegacyObservationFacade.js";
import { StandaloneObservationAdapter } from "../usecases/StandaloneObservationAdapter.js";

/** Shared real Track fixtures with explicit ownership. */
export function makeTrack(id, options = {}) {
  const proxy = { x: 0, y: 0 };
  const tween = gsap.to(proxy, { x: 100, y: 200, duration: 1, ease: "none", paused: true });
  const plugins = [{
    keys: ["x", "y"],
    compose: (raw) => {
      options.onCompose?.(id);
      return { transform: `translate3d(${raw.x ?? 0}px, ${raw.y ?? 0}px, 0px)` };
    },
  }];
  const track = new Track({
    id,
    observationAdapter: options.observationAdapter,
    interpolationTimeline: tween,
    proxyState: proxy,
    plugins,
    resolvedTrack: { id, keyframes: { x: {}, y: {} } },
  });
  return installLegacyObservationFacade(track);
}

/** Normalize a declarative motion and wire its real Tracks through one scope. */
export function buildRealGraph(motion, options = {}) {
  const graph = normalizeObservationGraph(motion);
  const composeCounts = new Map();
  const bump = (id) => {
    composeCounts.set(id, (composeCounts.get(id) ?? 0) + 1);
    options.onCompose?.(id);
  };
  const observationAdapter = options.observationAdapter ?? new StandaloneObservationAdapter();
  const tracks = new Map();
  for (const config of motion.tracks) {
    tracks.set(config.id, makeTrack(config.id, { onCompose: bump, observationAdapter }));
  }
  for (const config of motion.tracks) {
    for (const edge of config.observes ?? []) {
      tracks.get(config.id).setObserved(
        tracks.get(edge.source),
        (patch) => ({ [`from_${edge.source}`]: patch.transform }),
        { role: edge.role ?? "output" },
      );
    }
  }
  return { graph, tracks, composeCounts, observationAdapter };
}

export function diamondMotion() {
  return { tracks: [{ id: "a" }, { id: "b", observes: [{ source: "a" }] }, { id: "c", observes: [{ source: "a" }] }, { id: "d", observes: [{ source: "b" }, { source: "c" }] }] };
}

export function chainMotion(count) {
  return { tracks: Array.from({ length: count }, (_, i) => ({ id: `n${i}`, ...(i === 0 ? {} : { observes: [{ source: `n${i - 1}` }] }) })) };
}

export function independentChainsMotion() {
  return { tracks: [{ id: "a0" }, { id: "a1", observes: [{ source: "a0" }] }, { id: "b0" }, { id: "b1", observes: [{ source: "b0" }] }] };
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
    for (let j = 0; j < i; j += 1) if (rand() < edgeChance) observes.push({ source: `n${j}` });
    tracks.push({ id: `n${i}`, ...(observes.length ? { observes } : {}) });
  }
  return { tracks };
}

export function downstreamClosure(motion, marked) {
  const dependents = new Map(motion.tracks.map((t) => [t.id, []]));
  for (const track of motion.tracks) for (const edge of track.observes ?? []) dependents.get(edge.source).push(track.id);
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
