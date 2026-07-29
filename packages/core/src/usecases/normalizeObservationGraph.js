/**
 * Normalize a motion's declarative observation edges into an immutable graph IR.
 * The graph is JSON-safe and contains no Track instances or plugin functions.
 */
export function normalizeObservationGraph(motion) {
  const tracks = Array.isArray(motion?.tracks) ? motion.tracks : [];
  const nodes = tracks.filter(Boolean).map((track, index) => ({
    id: track.id,
    index,
  }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [];
  const errors = [];

  tracks.forEach((track, trackIndex) => {
    for (const [edgeIndex, edge] of (track?.observes || []).entries()) {
      const path = `tracks[${trackIndex}].observes[${edgeIndex}]`;
      if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
        errors.push({ ruleId: "track-observations", path, message: "Observation must be an object." });
        continue;
      }
      const role = edge.role ?? "output";
      if (!ids.has(track.id)) errors.push({ ruleId: "track-observations", path: `${path}.target`, message: `Unknown target track '${track.id}'.` });
      if (typeof edge.source !== "string" || !ids.has(edge.source)) {
        errors.push({ ruleId: "track-observations", path: `${path}.source`, message: `Unknown source track '${edge.source}'.` });
        continue;
      }
      if (edge.source === track.id) {
        errors.push({ ruleId: "track-observations-cycle", path: `${path}.source`, message: `Track '${track.id}' cannot observe itself.` });
        continue;
      }
      if (role !== "input" && role !== "output") errors.push({ ruleId: "track-observations", path: `${path}.role`, message: "Observation role must be 'input' or 'output'." });
      if (role === "input" && (typeof edge.target !== "string" || edge.target.length === 0)) errors.push({ ruleId: "track-observations", path: `${path}.target`, message: "Input observations require a non-empty target." });
      if (role === "output" && edge.target !== undefined) errors.push({ ruleId: "track-observations", path: `${path}.target`, message: "Output observations cannot define target." });
      edges.push({ source: edge.source, target: track.id, role, input: role === "input" ? edge.target : undefined, path });
    }
  });

  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (!outgoing.has(edge.source) || !outgoing.has(edge.target)) continue;
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
      if (indegree.get(edge.target) === 0) queue.push(edge.target);
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
