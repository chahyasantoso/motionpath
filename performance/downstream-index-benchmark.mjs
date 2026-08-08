import { performance } from "node:perf_hooks";
import { GraphPublisher } from "../packages/core/src/usecases/GraphPublisher.js";
import { normalizeObservationGraph } from "../packages/core/src/usecases/normalizeObservationGraph.js";

const frames = 120;
const chains = 60;
const depth = 5;

function forestGraph(useAlternateSource) {
  const tracks = [];
  for (let chain = 0; chain < chains; chain += 1) {
    for (let level = 0; level < depth; level += 1) {
      const source = level === 0 ? undefined : (level === depth - 1 && useAlternateSource && chain === 0 ? `c${chain}-n0` : `c${chain}-n${level - 1}`);
      tracks.push({
        id: `c${chain}-n${level}`,
        ...(source ? { observes: [{ source, role: "input", target: "parentWorld" }] } : {}),
      });
    }
  }
  return normalizeObservationGraph({ tracks });
}

function stubTracks(graph) {
  return new Map(graph.order.map((id) => [id, {
    id,
    isDestroyed: false,
    compose: (_raw, composed) => ({ value: (composed.get(id)?.value ?? 0) + 1 }),
  }]));
}

const first = forestGraph(false);
const alternate = forestGraph(true);
const tracks = stubTracks(first);
let writes = 0;
const publisher = new GraphPublisher({ graph: first, tracks, publish: () => { writes += 1; } });
publisher.markAllDirty();
publisher.flush();
writes = 0;

const start = performance.now();
for (let frame = 0; frame < frames; frame += 1) {
  publisher.applyGraph(frame % 2 === 0 ? alternate : first, tracks);
  publisher.flush();
}
const elapsedMs = performance.now() - start;

console.log(JSON.stringify({
  scenario: "downstream-index-rewire",
  topology: `${chains} chains x ${depth}`,
  frames,
  nodes: chains * depth,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  msPerFrame: Number((elapsedMs / frames).toFixed(3)),
  writesPerFrame: Number((writes / frames).toFixed(1)),
  changedEdgesPerFrame: 1,
}, null, 2));
