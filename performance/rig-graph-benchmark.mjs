import { performance } from "node:perf_hooks";
import { GraphPublisher } from "../packages/core/src/usecases/GraphPublisher.js";
import { normalizeObservationGraph } from "../packages/core/src/usecases/normalizeObservationGraph.js";

const chainScenarios = { small: 14, medium: 50, large: 250 };
const frames = 120;

function chainGraph(size) {
  const tracks = Array.from({ length: size }, (_, index) => ({
    id: `track-${index}`,
    observes:
      index === 0
        ? []
        : [
            {
              source: `track-${index - 1}`,
              role: "input",
              target: "parentWorld",
            },
          ],
  }));
  return normalizeObservationGraph({ tracks });
}

/** 60 short chains instead of one long one, so most of the graph can be idle. */
function forestGraph(chains, depth) {
  const tracks = [];
  for (let chain = 0; chain < chains; chain += 1) {
    for (let level = 0; level < depth; level += 1) {
      tracks.push({
        id: `c${chain}-n${level}`,
        observes:
          level === 0
            ? []
            : [
                {
                  source: `c${chain}-n${level - 1}`,
                  role: "input",
                  target: "parentWorld",
                },
              ],
      });
    }
  }
  return normalizeObservationGraph({ tracks });
}

function stubTracks(graph, counter) {
  const upstream = new Map(graph.nodes.map(({ id }) => [id, []]));
  for (const edge of graph.edges) upstream.get(edge.target).push(edge.source);
  return new Map(
    graph.order.map((id) => [
      id,
      {
        id,
        isDestroyed: false,
        compose: (_raw, composed) => {
          counter.composes += 1;
          const sources = upstream.get(id) ?? [];
          const inherited = sources.reduce(
            (total, source) => total + (composed.get(source)?.value ?? 0),
            0,
          );
          return { value: inherited + 1 };
        },
      },
    ]),
  );
}

function runChain(name, size) {
  const graphStart = performance.now();
  const graph = chainGraph(size);
  const graphMs = performance.now() - graphStart;
  const counter = { composes: 0 };
  const tracks = stubTracks(graph, counter);
  let writes = 0;
  const publisher = new GraphPublisher({
    graph,
    tracks,
    publish: () => {
      writes += 1;
    },
  });

  const composeStart = performance.now();
  for (let frame = 0; frame < frames; frame += 1) {
    publisher.markAllDirty();
    publisher.flush();
  }
  const composeMs = performance.now() - composeStart;

  return {
    scenario: name,
    topology: "chain",
    tracks: size,
    graphMs: Number(graphMs.toFixed(3)),
    composeMsPerFrame: Number((composeMs / frames).toFixed(3)),
    composesPerFrame: Number((counter.composes / frames).toFixed(1)),
    writesPerFrame: writes / frames,
  };
}

/**
 * The gate for the persistent cache. Everything is dirty in the chain
 * scenarios, so they cannot show a cache win by construction.
 */
function runIdleMajority(chains, depth) {
  const graph = forestGraph(chains, depth);
  const counter = { composes: 0 };
  const tracks = stubTracks(graph, counter);
  let writes = 0;
  const publisher = new GraphPublisher({
    graph,
    tracks,
    publish: () => {
      writes += 1;
    },
  });

  // Warm the cache once so steady-state cost is what gets measured.
  publisher.markAllDirty();
  publisher.flush();
  counter.composes = 0;
  writes = 0;

  const composeStart = performance.now();
  for (let frame = 0; frame < frames; frame += 1) {
    publisher.markDirty(`c${frame % chains}-n0`);
    publisher.flush();
  }
  const composeMs = performance.now() - composeStart;
  const nodes = chains * depth;

  return {
    scenario: "idle-majority",
    topology: `${chains} chains x ${depth}`,
    tracks: nodes,
    composeMsPerFrame: Number((composeMs / frames).toFixed(3)),
    composesPerFrame: Number((counter.composes / frames).toFixed(1)),
    writesPerFrame: writes / frames,
    // Expect roughly `depth`, not `nodes`. Anything near `nodes` means the
    // cache is not doing its job and should be removed from the plan.
    expectedComposesPerFrame: depth,
    nodeCount: nodes,
  };
}

const results = [
  ...Object.entries(chainScenarios).map(([name, size]) => runChain(name, size)),
  runIdleMajority(60, 5),
];

console.log(JSON.stringify(results, null, 2));
