import { performance } from "node:perf_hooks";
import { normalizeObservationGraph } from "../packages/core/src/usecases/normalizeObservationGraph.js";

const frames = 20000;
const chains = 60;
const depth = 5;
const warmup = 1000;

function forestGraph() {
  const tracks = [];
  for (let chain = 0; chain < chains; chain += 1) {
    for (let level = 0; level < depth; level += 1) {
      const source = level === 0 ? undefined : `c${chain}-n${level - 1}`;
      tracks.push({
        id: `c${chain}-n${level}`,
        ...(source
          ? { observes: [{ source, role: "input", target: "parentWorld" }] }
          : {}),
      });
    }
  }
  return normalizeObservationGraph({ tracks });
}

function indexes(graph) {
  const upstream = new Map(graph.nodes.map(({ id }) => [id, []]));
  const downstream = new Map(graph.nodes.map(({ id }) => [id, []]));
  for (const edge of graph.edges) {
    upstream.get(edge.target).push(edge.source);
    downstream.get(edge.source).push(edge.target);
  }
  return { upstream, downstream };
}

// This is the exact pre-PR-21 traversal shape: scan every target's upstream
// list, then test whether the current source is present. It is kept here as a
// benchmark oracle only, never production code.
function markDownstreamScan(seeds, upstream, nodeCount) {
  const marked = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const sourceId = queue.shift();
    for (const [targetId, targetUpstream] of upstream) {
      if (!targetUpstream.includes(sourceId) || marked.has(targetId)) continue;
      marked.add(targetId);
      queue.push(targetId);
    }
  }
  return marked.size === nodeCount ? marked : marked;
}

// This is the PR-21 production traversal shape, using source-to-dependent
// adjacency instead of scanning unrelated nodes.
function markDownstreamIndexed(seeds, downstream) {
  const marked = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const sourceId = queue.shift();
    for (const targetId of downstream.get(sourceId) ?? []) {
      if (marked.has(targetId)) continue;
      marked.add(targetId);
      queue.push(targetId);
    }
  }
  return marked;
}

function measure(
  label,
  fn,
  seeds,
  iterations,
  upstream,
  downstream,
  nodeCount,
) {
  for (let i = 0; i < warmup; i += 1)
    fn(seeds, upstream, downstream, nodeCount);
  const start = performance.now();
  let totalMarked = 0;
  for (let i = 0; i < iterations; i += 1)
    totalMarked += fn(seeds, upstream, downstream, nodeCount).size;
  const elapsedMs = performance.now() - start;
  return {
    label,
    elapsedMs,
    msPerMutation: elapsedMs / iterations,
    totalMarked,
  };
}

const graph = forestGraph();
const { upstream, downstream } = indexes(graph);
const seeds = [`c${Math.floor(chains / 2)}-n0`];
const scan = (nextSeeds, nextUpstream) =>
  markDownstreamScan(nextSeeds, nextUpstream, graph.nodes.length);
const indexed = (nextSeeds, _nextUpstream, nextDownstream) =>
  markDownstreamIndexed(nextSeeds, nextDownstream);

// Run both orders to reduce one-sided JIT/cache bias, then report the median.
const runs = [
  [
    measure(
      "scan",
      scan,
      seeds,
      frames,
      upstream,
      downstream,
      graph.nodes.length,
    ),
    measure(
      "indexed",
      indexed,
      seeds,
      frames,
      upstream,
      downstream,
      graph.nodes.length,
    ),
  ],
  [
    measure(
      "indexed",
      indexed,
      seeds,
      frames,
      upstream,
      downstream,
      graph.nodes.length,
    ),
    measure(
      "scan",
      scan,
      seeds,
      frames,
      upstream,
      downstream,
      graph.nodes.length,
    ),
  ],
];
const byLabel = (label) =>
  runs.map((run) => run.find((result) => result.label === label));
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const scanMs = median(byLabel("scan").map((result) => result.elapsedMs));
const indexedMs = median(byLabel("indexed").map((result) => result.elapsedMs));
const scanResult = byLabel("scan")[0];
const indexedResult = byLabel("indexed")[0];
const scanMarked = scanResult.totalMarked / frames;
const indexedMarked = indexedResult.totalMarked / frames;
if (scanMarked !== indexedMarked)
  throw new Error(
    `Traversal mismatch: scan marked ${scanMarked}, indexed marked ${indexedMarked}.`,
  );

console.log(
  JSON.stringify(
    {
      scenario: "downstream-index-old-vs-new",
      topology: `${chains} chains x ${depth}`,
      nodes: graph.nodes.length,
      iterations: frames,
      seeds,
      scanMs: Number(scanMs.toFixed(3)),
      indexedMs: Number(indexedMs.toFixed(3)),
      scanMsPerMutation: Number((scanMs / frames).toFixed(6)),
      indexedMsPerMutation: Number((indexedMs / frames).toFixed(6)),
      speedup: Number((scanMs / indexedMs).toFixed(2)),
      markedPerMutation: scanMarked,
      correctness: "equal closure",
    },
    null,
    2,
  ),
);
