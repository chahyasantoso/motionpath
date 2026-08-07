import { observationGraphEdgeKey } from "./observationEdge.js";

/**
 * The one topological sort in the system.
 *
 * There used to be two: this one and an inline copy inside
 * normalizeObservationGraph. They agreed on the happy path and diverged on tie
 * breaking and cycle reporting, which meant the compiled order a graph was
 * validated against was not always the order it was published in.
 *
 * Ties are broken by declaration position so the order is stable and
 * reproducible for a given input.
 *
 * @returns {{ order: string[], complete: boolean }} `complete` is false when a
 * cycle prevented every node from being emitted. The partial order is still
 * returned so callers that report rather than throw can show progress.
 */
export function tryTopologicalOrder(nodes, edges) {
  const indegree = new Map(nodes.map(({ id }) => [id, 0]));
  const outgoing = new Map(nodes.map(({ id }) => [id, []]));
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) {
      throw new Error(`Observation edge references an unknown track ('${edge.source}' -> '${edge.target}').`);
    }
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const position = new Map(nodes.map(({ id }, index) => [id, index]));
  const queue = nodes.filter(({ id }) => indegree.get(id) === 0).map(({ id }) => id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const target of outgoing.get(id)) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) !== 0) continue;
      const insertAt = queue.findIndex((queuedId) => position.get(queuedId) > position.get(target));
      if (insertAt === -1) queue.push(target);
      else queue.splice(insertAt, 0, target);
    }
  }
  return { order, complete: order.length === nodes.length };
}

export function buildTopologicalOrder(nodes, edges) {
  const { order, complete } = tryTopologicalOrder(nodes, edges);
  if (!complete) throw new Error("Observation graph contains a cycle.");
  return order;
}

/**
 * Normalize a motion's declarative observation edges into an immutable graph IR.
 * The graph is JSON-safe and contains no Track instances or plugin functions.
 */
export function normalizeObservationGraph(motion) {
  const tracks = Array.isArray(motion?.tracks) ? motion.tracks : [];
  const nodes = [];
  const nodeIndexes = new Map();
  const errors = [];

  tracks.forEach((track, index) => {
    const id = track?.id;
    if (typeof id !== "string" || id.length === 0) {
      errors.push({ ruleId: "track-observations", path: `tracks[${index}].id`, message: "Track id must be a non-empty string." });
      return;
    }
    if (nodeIndexes.has(id)) {
      errors.push({ ruleId: "track-observations-duplicate-node", path: `tracks[${index}].id`, message: `Track '${id}' is declared more than once.` });
      return;
    }
    nodeIndexes.set(id, index);
    nodes.push({ id, index });
  });

  const edges = [];
  const edgeKeys = new Set();
  tracks.forEach((track, trackIndex) => {
    for (const [edgeIndex, edge] of (track?.observes || []).entries()) {
      const path = `tracks[${trackIndex}].observes[${edgeIndex}]`;
      if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
        errors.push({ ruleId: "track-observations", path, message: "Observation must be an object." });
        continue;
      }
      const role = edge.role ?? "output";
      const targetNode = track?.id;
      if (!nodeIndexes.has(targetNode)) {
        errors.push({ ruleId: "track-observations", path: `${path}.target`, message: `Unknown target track '${targetNode}'.` });
        continue;
      }
      if (typeof edge.source !== "string" || !nodeIndexes.has(edge.source)) {
        errors.push({ ruleId: "track-observations", path: `${path}.source`, message: `Unknown source track '${edge.source}'.` });
        continue;
      }
      if (edge.source === targetNode) {
        errors.push({ ruleId: "track-observations-cycle", path: `${path}.source`, message: `Track '${targetNode}' cannot observe itself.` });
        continue;
      }
      if (role !== "input" && role !== "output") {
        errors.push({ ruleId: "track-observations", path: `${path}.role`, message: "Observation role must be 'input' or 'output'." });
        continue;
      }
      if (role === "input" && (typeof edge.target !== "string" || edge.target.length === 0)) {
        errors.push({ ruleId: "track-observations", path: `${path}.target`, message: "Input observations require a non-empty target." });
        continue;
      }
      if (role === "output" && edge.target !== undefined) {
        errors.push({ ruleId: "track-observations", path: `${path}.target`, message: "Output observations cannot define target." });
        continue;
      }
      const candidate = { source: edge.source, target: targetNode, role, input: role === "input" ? edge.target : undefined };
      const key = observationGraphEdgeKey(candidate);
      if (edgeKeys.has(key)) {
        errors.push({ ruleId: "track-observations-duplicate-edge", path, message: `Duplicate observation edge from '${edge.source}' to '${targetNode}'.` });
        continue;
      }
      edgeKeys.add(key);
      edges.push({ ...candidate, path });
    }
  });

  // One sorter, shared with the publisher. The normalizer reports a cycle as a
  // validation error instead of throwing, which is the only difference.
  const { order, complete } = tryTopologicalOrder(nodes, edges);
  if (!complete) errors.push({ ruleId: "track-observations-cycle", path: "tracks", message: "Observation graph contains a cycle." });

  return Object.freeze({
    valid: errors.length === 0,
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge))),
    order: Object.freeze(order),
    errors: Object.freeze(errors.map((error) => Object.freeze(error))),
  });
}

/**
 * By default this refuses to hand out a partial order for an invalid graph.
 * The old advisory behavior returned whatever Kahn's algorithm managed to
 * build, so a caller that ignored `errors` got a publisher that silently
 * never composed the cyclic nodes.
 */
export function topologicalTrackOrder(graph, { strict = true } = {}) {
  if (!graph || !Array.isArray(graph.order)) return [];
  if (strict && graph.errors?.length) {
    throw new Error(`Cannot use invalid observation graph: ${graph.errors.map((error) => error.message).join("; ")}`);
  }
  return [...graph.order];
}
