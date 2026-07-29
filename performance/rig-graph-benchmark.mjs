import { performance } from "node:perf_hooks";
import { GraphPublisher } from "../packages/core/src/usecases/GraphPublisher.js";
import { normalizeObservationGraph } from "../packages/core/src/usecases/normalizeObservationGraph.js";

const scenarios = { small: 14, medium: 50, large: 250 };
const frames = 120;

function makeGraph(size) {
  const tracks = Array.from({ length: size }, (_, index) => ({
    id: `track-${index}`,
    observes: index === 0 ? [] : [{ source: `track-${index - 1}`, role: "input", target: "parentWorld" }],
  }));
  return normalizeObservationGraph({ tracks });
}

function run(name, size) {
  const graphStart = performance.now();
  const graph = makeGraph(size);
  const graphMs = performance.now() - graphStart;
  const tracks = new Map(graph.order.map((id) => [id, {
    compose: (_raw, composed) => ({ value: (composed.get(`track-${Math.max(0, Number(id.slice(6)) - 1)}`)?.value ?? 0) + 1 }),
  }]));
  let writes = 0;
  const publisher = new GraphPublisher({ order: graph.order, tracks, publish: () => { writes += 1; } });
  const composeStart = performance.now();
  for (let frame = 0; frame < frames; frame += 1) {
    publisher.markAllDirty();
    publisher.flush();
  }
  const composeMs = performance.now() - composeStart;
  return { scenario: name, tracks: size, graphMs: Number(graphMs.toFixed(3)), composeMsPerFrame: Number((composeMs / frames).toFixed(3)), writesPerFrame: writes / frames };
}

console.log(JSON.stringify(Object.entries(scenarios).map(([name, size]) => run(name, size)), null, 2));
