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
      const key = `${edge.source}${targetNode}${role}${edge.target ?? ""}`;
      if (edgeKeys.has(key)) {
        errors.push({ ruleId: "track-observations-duplicate-edge", path, message: `Duplicate observation edge from '${edge.source}' to '${targetNode}'.` });
        continue;
      }
      edgeKeys.add(key);
      edges.push({ source: edge.source, target: targetNode, role, input: role === "input" ? edge.target : undefined, path });
    }
  });

  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    outgoing.get(edge.source).push(edge);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const edge of outgoing.get(id)) {
      indegree.set(edge.target, indegree.get(edge.target) - 1);
      if (indegree.get(edge.target) === 0) {
        const insertAt = queue.findIndex((queuedId) => nodeIndexes.get(queuedId) > nodeIndexes.get(edge.target));
        if (insertAt === -1) queue.push(edge.target);
        else queue.splice(insertAt, 0, edge.target);
      }
    }
  }
  if (order.length !== nodes.length) errors.push({ ruleId: "track-observations-cycle", path: "tracks", message: "Observation graph contains a cycle." });

  return Object.freeze({
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge))),
    order: Object.freeze(order),
    errors: Object.freeze(errors.map((error) => Object.freeze(error))),
  });
}

export function topologicalTrackOrder(graph) {
  return graph?.order ? [...graph.order] : [];
}
